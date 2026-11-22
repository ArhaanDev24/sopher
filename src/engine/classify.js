// Classification engine: decides whether each piece of logged work is capitalized (capex) or
// expensed (opex), following the internal-use software stages of ASC 350-40.
//
// Pure functions only, with no Forge or network calls, so the rules are unit-testable and reproducible.
//
// Inputs are normalized by src/data/jira.js:
//   epic  = { key, summary, authorizedAt, releasedAt }
//   issue = { key, summary, issueType, epicKey, labels, created, resolved,
//             assigneeAccountId, originalEstimateSeconds,
//             worklogs: [{ accountId, started, seconds }] }

import { parseDate, toDay } from './dates.js';

export const STAGE = Object.freeze({
  PRELIMINARY: 'preliminary',
  DEVELOPMENT: 'development',
  POST: 'post-implementation',
});

export const DEFAULT_SETTINGS = Object.freeze({
  currency: 'USD',
  defaultHourlyRate: 95,
  ratesByAccountId: {},
  usefulLifeMonths: 36,
  projectKeys: [],
  confluenceSpaceKey: '',
  expenseIssueTypes: ['Bug', 'Support', 'Incident'],
  researchIssueTypes: ['Spike'],
  capitalizableIssueTypes: ['Story', 'Task', 'Sub-task', 'Subtask', 'Feature'],
  maintenanceLabels: ['maintenance', 'tech-debt', 'support', 'bugfix'],
  researchLabels: ['spike', 'research', 'discovery', 'poc'],
});

export function mergeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    ratesByAccountId: { ...DEFAULT_SETTINGS.ratesByAccountId, ...(settings.ratesByAccountId ?? {}) },
  };
}

const lc = (s) => String(s ?? '').trim().toLowerCase();
const inList = (value, list) => list.some((item) => lc(item) === lc(value));
const round2 = (n) => Math.round(n * 100) / 100;

/** Project stage of an epic on a given date. Without an authorization date, everything is preliminary. */
export function stageAt(epic, date) {
  const d = parseDate(date);
  const authorized = parseDate(epic?.authorizedAt);
  const released = parseDate(epic?.releasedAt);
  if (!authorized || d < authorized) return STAGE.PRELIMINARY;
  if (released && d >= released) return STAGE.POST;
  return STAGE.DEVELOPMENT;
}

/** Logged work, or one estimated entry from the original estimate when nothing is logged. */
function workEntries(issue) {
  const logged = (issue.worklogs ?? []).filter((w) => w.seconds > 0 && w.started);
  if (logged.length > 0) return logged.map((w) => ({ ...w, estimated: false }));
  if (issue.originalEstimateSeconds > 0) {
    return [{
      accountId: issue.assigneeAccountId ?? null,
      started: issue.resolved ?? issue.created,
      seconds: issue.originalEstimateSeconds,
      estimated: true,
    }];
  }
  return [];
}

/**
 * Classifies one issue. Returns per-entry treatment (work can span stages, e.g. some hours
 * before authorization and some after), totals, confidence, reasons and a review flag.
 */
export function classifyIssue(issue, epic, settings, override) {
  const s = mergeSettings(settings);
  const labels = (issue.labels ?? []).map(lc);
  const reasons = [];
  let confidence = 'high';
  let needsReview = false;
  let fixed = null; // when set, every entry gets this treatment
  let basis;

  if (override) {
    basis = 'override';
    fixed = override.treatment;
    reasons.push(`Controller override (${fixed}) by ${override.byName ?? 'a controller'} on ${toDay(override.at)}: ${override.reason}`);
  } else if (inList(issue.issueType, s.expenseIssueTypes) || labels.some((l) => inList(l, s.maintenanceLabels))) {
    basis = 'maintenance';
    fixed = 'opex';
    reasons.push(`${issue.issueType} / maintenance work is expensed as incurred, whatever the project stage.`);
  } else if (inList(issue.issueType, s.researchIssueTypes) || labels.some((l) => inList(l, s.researchLabels))) {
    basis = 'research';
    fixed = 'opex';
    reasons.push('Research, spike or discovery work belongs to the preliminary project stage and is expensed.');
  } else {
    basis = 'stage';
    if (!epic) {
      fixed = 'opex';
      confidence = 'low';
      needsReview = true;
      reasons.push('Not linked to an epic, so its project stage is unknown. Expensed until a controller reviews it.');
    } else if (!epic.authorizedAt) {
      fixed = 'opex';
      confidence = 'low';
      needsReview = true;
      reasons.push(`Epic ${epic.key} has no project authorization date (approved spec), so it is still treated as preliminary and expensed.`);
    } else {
      if (!inList(issue.issueType, s.capitalizableIssueTypes)) {
        confidence = 'medium';
        needsReview = true;
        reasons.push(`Issue type "${issue.issueType}" isn't in the capitalizable list. It was treated as feature work based on its epic's stage.`);
      }
      const window = epic.releasedAt
        ? `from ${toDay(epic.authorizedAt)} until its release on ${toDay(epic.releasedAt)}`
        : `since ${toDay(epic.authorizedAt)} and is not released yet`;
      reasons.push(`Epic ${epic.key} has been in the application development stage ${window}. Work logged in that window is capitalized; work before or after it is expensed.`);
    }
  }

  const raw = workEntries(issue);
  if (raw.some((e) => e.estimated)) {
    if (confidence === 'high') confidence = 'medium';
    reasons.push('No time is logged, so cost is estimated from the original estimate.');
  }
  if (raw.length === 0) reasons.push('No logged time or estimate, so no cost is attributed.');

  const entries = raw.map((e) => {
    const stage = epic ? stageAt(epic, e.started) : STAGE.PRELIMINARY;
    const treatment = fixed ?? (stage === STAGE.DEVELOPMENT ? 'capex' : 'opex');
    const rate = s.ratesByAccountId[e.accountId] ?? s.defaultHourlyRate;
    const hours = e.seconds / 3600;
    return {
      started: parseDate(e.started).toISOString(),
      accountId: e.accountId,
      hours: round2(hours),
      rate,
      cost: round2(hours * rate),
      stage,
      treatment,
      estimated: e.estimated,
    };
  });

  const capex = round2(entries.filter((e) => e.treatment === 'capex').reduce((a, e) => a + e.cost, 0));
  const opex = round2(entries.filter((e) => e.treatment === 'opex').reduce((a, e) => a + e.cost, 0));
  let treatment;
  if (entries.length === 0) {
    treatment = fixed ?? (epic && stageAt(epic, issue.resolved ?? issue.created) === STAGE.DEVELOPMENT ? 'capex' : 'opex');
  } else if (capex > 0 && opex > 0) {
    treatment = 'mixed';
  } else {
    treatment = capex > 0 ? 'capex' : 'opex';
  }

  return {
    key: issue.key,
    summary: issue.summary,
    issueType: issue.issueType,
    epicKey: epic?.key ?? null,
    basis,
    treatment,
    confidence,
    needsReview,
    overridden: Boolean(override),
    reasons,
    hours: round2(entries.reduce((a, e) => a + e.hours, 0)),
    capex,
    opex,
    entries,
  };
}
