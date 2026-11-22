// Forge entry points: the UI Kit resolver (dashboard, issue panel, admin page) and the Rovo actions,
// which are also exposed as MCP tools.

import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

import {
  getIssueClassification, getSchedule, normalizeIssueKey, normalizeProjectKey, normalizeQuarter,
} from './service.js';
import { getSettings, saveSettings, setOverride } from './data/store.js';
import { seedDemoData } from './data/seed.js';
import { recentQuarters } from './engine/dates.js';

const ADMIN_MODULE = 'sopher-admin';

/** Every resolver returns { ok, data } or { ok: false, error } so the UI can show readable errors. */
const safe = (fn) => async (req) => {
  try {
    return { ok: true, data: await fn(req) };
  } catch (err) {
    console.error(err);
    return { ok: false, error: err.message ?? String(err) };
  }
};

const resolver = new Resolver();

resolver.define('getBootstrap', safe(async () => {
  const settings = await getSettings();
  return { settings, quarters: recentQuarters(6) };
}));

resolver.define('getSchedule', safe(({ payload }) => getSchedule(payload)));

resolver.define('getIssueClassification', safe(({ context }) => {
  const issueKey = context.extension?.issue?.key;
  if (!issueKey) throw new Error('No issue in context.');
  return getIssueClassification({ issueKey });
}));

resolver.define('setOverride', safe(async ({ payload, context }) => {
  const issueKey = normalizeIssueKey(context.extension?.issue?.key ?? payload.issueKey);
  if (payload.clear) return setOverride(issueKey, null);
  const me = await api.asUser().requestJira(route`/rest/api/3/myself`).then((r) => r.json());
  return setOverride(issueKey, {
    treatment: payload.treatment,
    reason: payload.reason,
    byAccountId: context.accountId,
    byName: me.displayName ?? null,
  });
}));

resolver.define('saveSettings', safe(({ payload, context }) => {
  // The resolver is shared by all modules, so only accept settings changes from the admin page,
  // which Jira shows to site admins only.
  if (context.moduleKey !== ADMIN_MODULE) throw new Error('Settings can only be changed from the Sopher admin page.');
  const patch = {};
  if (payload.defaultHourlyRate !== undefined) patch.defaultHourlyRate = Number(payload.defaultHourlyRate);
  if (payload.usefulLifeMonths !== undefined) patch.usefulLifeMonths = Number(payload.usefulLifeMonths);
  if (payload.currency !== undefined) patch.currency = String(payload.currency).trim().toUpperCase() || 'USD';
  if (payload.projectKeys !== undefined) {
    patch.projectKeys = String(payload.projectKeys).split(/[\s,]+/).map((k) => k.trim().toUpperCase()).filter(Boolean);
  }
  return saveSettings(patch);
}));

resolver.define('seedDemoData', safe(async ({ payload, context }) => {
  if (context.moduleKey !== ADMIN_MODULE) throw new Error('Demo data can only be loaded from the Sopher admin page.');
  const projectKey = normalizeProjectKey(payload.projectKey);
  const result = await seedDemoData(projectKey);
  const settings = await getSettings();
  if (!settings.projectKeys.includes(projectKey)) {
    await saveSettings({ projectKeys: [...settings.projectKeys, projectKey] });
  }
  return result;
}));

export const handler = resolver.getDefinitions();

// ---- Rovo actions / MCP tools ------------------------------------------------------------
// Inputs arrive on `payload`. Return compact JSON (the 5 MB action limit is far above this).

const actionSafe = (fn) => async (payload) => {
  try {
    return await fn(payload ?? {});
  } catch (err) {
    console.error(err);
    return { error: err.message ?? String(err) };
  }
};

export const getScheduleAction = actionSafe(async ({ projectKey, quarter }) => {
  const s = await getSchedule({ projectKey, quarter: normalizeQuarter(quarter) });
  return {
    projectKey: s.projectKey,
    quarter: s.quarter,
    currency: s.currency,
    totals: s.totals,
    assets: s.assets,
    reviewQueueCount: s.reviewQueue.length,
    note: 'Amounts are cost (logged hours × loaded rate). estimatedCost is the part based on original estimates, not logged time.',
  };
});

export const explainClassificationAction = actionSafe(async ({ issueKey }) => {
  const c = await getIssueClassification({ issueKey });
  const byStage = {};
  for (const e of c.entries) {
    const b = (byStage[e.stage] ??= { hours: 0, cost: 0, treatment: e.treatment });
    b.hours = Math.round((b.hours + e.hours) * 100) / 100;
    b.cost = Math.round((b.cost + e.cost) * 100) / 100;
  }
  return {
    issueKey: c.key,
    summary: c.summary,
    issueType: c.issueType,
    epic: c.epic && { key: c.epic.key, summary: c.epic.summary, authorizedAt: c.epic.authorizedAt, releasedAt: c.epic.releasedAt },
    treatment: c.treatment,
    confidence: c.confidence,
    needsReview: c.needsReview,
    overridden: c.overridden,
    currency: c.currency,
    capex: c.capex,
    opex: c.opex,
    hours: c.hours,
    byStage,
    reasons: c.reasons,
  };
});

export const listReviewQueueAction = actionSafe(async ({ projectKey, quarter }) => {
  const s = await getSchedule({ projectKey, quarter: normalizeQuarter(quarter) });
  return { projectKey: s.projectKey, quarter: s.quarter, currency: s.currency, count: s.reviewQueue.length, items: s.reviewQueue };
});
