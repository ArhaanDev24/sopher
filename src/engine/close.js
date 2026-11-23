// Quarter close: freeze the figures a controller signed off, then detect drift.
//
// After a quarter is closed, people keep working in Jira: someone back-dates a time log, moves an
// issue to another epic, or an override is changed. Each of these silently changes the
// numbers already reported. Sopher keeps a compact snapshot of the closed quarter and shows exactly
// what moved since then. Auditors call these post-close adjustments.
// Pure functions only.

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Compact, storable snapshot of a schedule at close.
 * @param {object} schedule result of buildSchedule (plus projectKey)
 * @param {{ at: string, byAccountId: string|null, byName: string|null }} who
 */
export function snapshotFromSchedule(schedule, { at, byAccountId = null, byName = null }) {
  const issues = {};
  for (const r of schedule.issues ?? []) {
    if (r.quarterCapex || r.quarterOpex) issues[r.key] = [r.quarterCapex, r.quarterOpex];
  }
  return {
    projectKey: schedule.projectKey,
    quarter: schedule.quarter,
    at,
    byAccountId,
    byName,
    totals: {
      capex: schedule.totals.capex,
      opex: schedule.totals.opex,
      amortization: schedule.totals.amortization,
      netBookValue: schedule.totals.netBookValue,
    },
    issues,
  };
}

/**
 * What changed between the closed snapshot and the live schedule.
 * @returns {{ hasDrift: boolean, totals: object, changes: Array<object> }}
 */
export function diffAgainstClose(snapshot, schedule) {
  if (!snapshot) return null;
  const live = {};
  const summaries = {};
  for (const r of schedule.issues ?? []) {
    if (r.quarterCapex || r.quarterOpex) live[r.key] = [r.quarterCapex, r.quarterOpex];
    summaries[r.key] = r.summary;
  }
  const keys = [...new Set([...Object.keys(snapshot.issues ?? {}), ...Object.keys(live)])].sort();
  const changes = [];
  for (const key of keys) {
    const [bc, bo] = snapshot.issues?.[key] ?? [0, 0];
    const [ac, ao] = live[key] ?? [0, 0];
    if (round2(ac - bc) !== 0 || round2(ao - bo) !== 0) {
      changes.push({
        key,
        summary: summaries[key] ?? null,
        before: { capex: bc, opex: bo },
        after: { capex: ac, opex: ao },
        capexDelta: round2(ac - bc),
        opexDelta: round2(ao - bo),
        kind: !snapshot.issues?.[key] ? 'added' : !live[key] ? 'removed' : 'changed',
      });
    }
  }
  const t = snapshot.totals;
  const totals = {
    capexDelta: round2(schedule.totals.capex - t.capex),
    opexDelta: round2(schedule.totals.opex - t.opex),
    amortizationDelta: round2(schedule.totals.amortization - t.amortization),
  };
  const hasDrift = changes.length > 0 || Object.values(totals).some((d) => d !== 0);
  return { hasDrift, totals, changes };
}

export const closeKey = (projectKey, quarter) => `${projectKey}:${quarter}`;
