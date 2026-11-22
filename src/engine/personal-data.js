// Personal data handling for the override audit trail.
//
// Overrides store the Atlassian account ID and display name of the controller who made them.
// Once a day Sopher reports those account IDs to Atlassian's personal data reporting API
// (privacy.reportPersonalData) and acts on the answer:
//   closed  -> remove the account ID and name, keeping the decision and reason ("Former user")
//   updated -> refresh the cached display name
// Pure functions only. The scheduled job lives in src/index.js.

export const FORMER_USER = 'Former user';

/**
 * One entry per account ID, with the last time we stored or refreshed that person's data.
 * @param {Record<string, object>} overrides map of issueKey -> override
 * @returns {{ accountId: string, updatedAt: string }[]}
 */
export function accountsToReport(overrides) {
  const latest = new Map();
  for (const o of Object.values(overrides ?? {})) {
    if (!o?.byAccountId) continue;
    const at = o.accountDataAt ?? o.at;
    if (!at) continue;
    const prev = latest.get(o.byAccountId);
    if (!prev || at > prev) latest.set(o.byAccountId, at);
  }
  return [...latest].map(([accountId, updatedAt]) => ({ accountId, updatedAt: new Date(updatedAt).toISOString() }));
}

/**
 * Applies Atlassian's answer to the stored overrides.
 * @param {Record<string, object>} overrides
 * @param {{ accountId: string, status: 'closed'|'updated' }[]} updates
 * @param {Record<string, string>} freshNames display names fetched for updated accounts
 * @param {Date} now
 */
export function applyAccountUpdates(overrides, updates, freshNames = {}, now = new Date()) {
  const status = new Map((updates ?? []).map((u) => [u.accountId, u.status]));
  const stamp = now.toISOString();
  let closed = 0;
  let updated = 0;
  const next = {};
  for (const [issueKey, o] of Object.entries(overrides ?? {})) {
    const s = o?.byAccountId ? status.get(o.byAccountId) : undefined;
    if (s === 'closed') {
      next[issueKey] = { ...o, byAccountId: null, byName: FORMER_USER, accountDataAt: stamp, anonymizedAt: stamp };
      closed += 1;
    } else if (s === 'updated') {
      next[issueKey] = { ...o, byName: freshNames[o.byAccountId] ?? o.byName ?? null, accountDataAt: stamp };
      updated += 1;
    } else {
      next[issueKey] = o;
    }
  }
  return { overrides: next, closed, updated };
}
