// Forge entry points: the UI Kit resolver (dashboard, issue panel, admin page) and the Rovo actions,
// which are also exposed as MCP tools.

import Resolver from '@forge/resolver';
import api, { privacy, route } from '@forge/api';

import {
  getIssueClassification, getSchedule, normalizeIssueKey, normalizeProjectKey, normalizeQuarter, publishMemo,
  setEpicAuthorization, closeQuarter, reopenQuarter, nudgeReviewItem,
} from './service.js';
import {
  getCloses, getOverrides, getSettings, saveCloses, saveOverrides, saveSettings, setOverride,
} from './data/store.js';
import { accountsToReport, applyAccountUpdates } from './engine/personal-data.js';
import { seedDemoData } from './data/seed.js';
import { recentQuarters } from './engine/dates.js';
import { describeEvidence, summarizeEvidence } from './engine/evidence.js';

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

resolver.define('getSchedule', safe(({ payload, context }) => getSchedule({ ...payload, cloudId: context.cloudId })));

resolver.define('getIssueClassification', safe(({ context }) => {
  const issueKey = context.extension?.issue?.key;
  if (!issueKey) throw new Error('No issue in context.');
  return getIssueClassification({ issueKey, cloudId: context.cloudId });
}));

resolver.define('setEpicAuthorization', safe(({ payload, context }) => {
  const issueKey = context.extension?.issue?.key;
  if (!issueKey) throw new Error('No issue in context.');
  return setEpicAuthorization({ issueKey, authorizedAt: payload.authorizedAt ?? null });
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

resolver.define('publishMemo', safe(({ payload, context }) => publishMemo({ ...payload, cloudId: context.cloudId })));

resolver.define('closeQuarter', safe(({ payload, context }) => closeQuarter({ ...payload, cloudId: context.cloudId, accountId: context.accountId })));

resolver.define('reopenQuarter', safe(({ payload }) => reopenQuarter(payload)));

resolver.define('nudgeReviewItem', safe(({ payload, context }) => nudgeReviewItem({ ...payload, cloudId: context.cloudId })));

resolver.define('saveSettings', safe(({ payload, context }) => {
  // The resolver is shared by all modules, so only accept settings changes from the admin page,
  // which Jira shows to site admins only.
  if (context.moduleKey !== ADMIN_MODULE) throw new Error('Settings can only be changed from the Sopher admin page.');
  const patch = {};
  if (payload.defaultHourlyRate !== undefined) patch.defaultHourlyRate = Number(payload.defaultHourlyRate);
  if (payload.usefulLifeMonths !== undefined) patch.usefulLifeMonths = Number(payload.usefulLifeMonths);
  if (payload.confluenceSpaceKey !== undefined) patch.confluenceSpaceKey = String(payload.confluenceSpaceKey).trim();
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

// Each call logs its name, inputs and outcome (no figures), so `forge logs` shows what the agent did.
const actionSafe = (name, fn) => async (payload) => {
  const { context, ...inputs } = payload ?? {};
  const started = Date.now();
  try {
    const result = await fn({ ...inputs, cloudId: context?.cloudId });
    console.log(`[action] ${name} ${JSON.stringify(inputs)} -> ${result?.error ? `error: ${result.error}` : 'ok'} (${Date.now() - started}ms)`);
    return result;
  } catch (err) {
    console.error(`[action] ${name} ${JSON.stringify(inputs)} -> error: ${err.message}`);
    return { error: err.message ?? String(err) };
  }
};

export const getScheduleAction = actionSafe('get-schedule', async ({ projectKey, quarter, cloudId }) => {
  const s = await getSchedule({ projectKey, quarter: normalizeQuarter(quarter), cloudId });
  return {
    projectKey: s.projectKey,
    quarter: s.quarter,
    currency: s.currency,
    totals: s.totals,
    assets: s.assets,
    reviewQueueCount: s.reviewQueue.length,
    closed: s.close ? { at: s.close.at, by: s.close.byName } : null,
    postCloseAdjustments: s.drift?.hasDrift ? { totals: s.drift.totals, items: s.drift.changes } : null,
    note: 'Amounts are cost (logged hours × loaded rate). estimatedCost is the part based on original estimates, not logged time. '
      + 'operatingIncomeEffect is how much higher operating income is than if everything were expensed. '
      + 'postCloseAdjustments lists changes made after the quarter was closed.',
  };
});

export const explainClassificationAction = actionSafe('explain-classification', async ({ issueKey, cloudId }) => {
  const c = await getIssueClassification({ issueKey, cloudId });
  if (c.mode === 'epic') {
    return {
      issueKey: c.key,
      summary: c.summary,
      type: 'Epic (software asset)',
      quarter: c.quarter,
      currency: c.currency,
      authorizedAt: c.authorizedAt,
      asset: c.asset,
      itemsNeedingReview: c.reviewCount,
      evidence: describeEvidence(summarizeEvidence(c.evidence)),
    };
  }
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
    evidence: {
      issue: describeEvidence(summarizeEvidence(c.evidence.issue)),
      epic: c.epic ? describeEvidence(summarizeEvidence(c.evidence.epic)) : null,
      source: 'Atlassian Teamwork Graph (linked pull requests, deployments and goals)',
    },
  };
});

export const listReviewQueueAction = actionSafe('list-review-queue', async ({ projectKey, quarter, cloudId }) => {
  const s = await getSchedule({ projectKey, quarter: normalizeQuarter(quarter), cloudId });
  return { projectKey: s.projectKey, quarter: s.quarter, currency: s.currency, count: s.reviewQueue.length, items: s.reviewQueue };
});

export const draftMemoAction = actionSafe('draft-cap-memo', async ({ projectKey, quarter, spaceKey, cloudId }) => {
  const page = await publishMemo({ projectKey, quarter: normalizeQuarter(quarter), spaceKey, cloudId });
  return {
    ...page,
    note: page.created ? 'Created a new draft memo page.' : `Updated the existing memo page (version ${page.version}).`,
  };
});

// ---- Personal data (daily scheduled trigger) ------------------------------------------------
// Reports the account IDs stored in override audit records to Atlassian. Closed accounts are
// anonymized ("Former user"), and updated accounts get their display name refreshed.

export const personalDataJob = async () => {
  // Account IDs live in override audit records and in quarter-close records ("closed by").
  const [overrides, closes] = await Promise.all([getOverrides(), getCloses()]);
  const records = {
    ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [`o:${k}`, v])),
    ...Object.fromEntries(Object.entries(closes).map(([k, v]) => [`c:${k}`, v])),
  };
  const accounts = accountsToReport(records);
  if (accounts.length === 0) {
    console.log('[personal-data] no stored account IDs');
    return;
  }
  const updates = await privacy.reportPersonalData(accounts);
  const freshNames = {};
  for (const { accountId } of updates.filter((u) => u.status === 'updated')) {
    const res = await api.asApp().requestJira(route`/rest/api/3/user?accountId=${accountId}`, { headers: { Accept: 'application/json' } });
    if (res.ok) freshNames[accountId] = (await res.json()).displayName ?? null;
  }
  const { overrides: next, closed, updated } = applyAccountUpdates(records, updates, freshNames);
  if (closed || updated) {
    const pick = (prefix) => Object.fromEntries(Object.entries(next)
      .filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
    await Promise.all([saveOverrides(pick('o:')), saveCloses(pick('c:'))]);
  }
  console.log(`[personal-data] checked ${accounts.length} account(s): ${closed} closed, ${updated} updated`);
};
