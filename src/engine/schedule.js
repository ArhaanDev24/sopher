// Rolls classified work up into a quarterly capitalization schedule per software asset (epic),
// with straight-line amortization from the month after the asset is placed in service (released).

import { classifyIssue, mergeSettings, stageAt } from './classify.js';
import { monthIndex, parseDate, parseQuarter, toDay } from './dates.js';

const round2 = (n) => Math.round(n * 100) / 100;
const sum = (xs, f) => round2(xs.reduce((a, x) => a + f(x), 0));

function amortization(base, releasedAt, usefulLifeMonths, quarterStart, quarterEnd) {
  if (!releasedAt || base <= 0 || usefulLifeMonths <= 0) return { inQuarter: 0, accumulated: 0 };
  const monthly = base / usefulLifeMonths;
  const first = monthIndex(releasedAt) + 1;
  const last = first + usefulLifeMonths - 1;
  const qFirst = monthIndex(quarterStart);
  const qLast = monthIndex(quarterEnd) - 1;
  const months = (from, to) => Math.max(0, Math.min(to, last) - Math.max(from, first) + 1);
  return {
    inQuarter: round2(monthly * months(qFirst, qLast)),
    accumulated: round2(monthly * months(first, qLast)),
  };
}

/**
 * @param {object} args
 * @param {Array} args.epics
 * @param {Array} args.issues
 * @param {object} [args.settings]
 * @param {object} [args.overrides] map of issueKey -> override
 * @param {string} args.quarter "YYYY-QN"
 */
export function buildSchedule({ epics, issues, settings, overrides = {}, quarter }) {
  const s = mergeSettings(settings);
  const { start, end } = parseQuarter(quarter);
  const inQuarter = (e) => {
    const d = parseDate(e.started);
    return d >= start && d < end;
  };
  const toDate = (e) => parseDate(e.started) < end;

  const epicByKey = new Map(epics.map((e) => [e.key, e]));
  const classified = issues.map((i) => classifyIssue(i, epicByKey.get(i.epicKey) ?? null, s, overrides[i.key]));

  const rows = classified.map((c) => {
    const q = c.entries.filter(inQuarter);
    return {
      ...c,
      quarterHours: sum(q, (e) => e.hours),
      quarterCapex: sum(q.filter((e) => e.treatment === 'capex'), (e) => e.cost),
      quarterOpex: sum(q.filter((e) => e.treatment === 'opex'), (e) => e.cost),
      activeInQuarter: q.length > 0,
    };
  });

  const groups = [...epics.map((e) => e.key), null];
  const assets = groups
    .map((epicKey) => {
      const epic = epicKey ? epicByKey.get(epicKey) : null;
      const its = rows.filter((r) => r.epicKey === epicKey);
      const capexToDate = sum(its, (r) => sum(r.entries.filter((e) => e.treatment === 'capex' && toDate(e)), (e) => e.cost));
      const amort = epic
        ? amortization(capexToDate, epic.releasedAt, s.usefulLifeMonths, start, end)
        : { inQuarter: 0, accumulated: 0 };
      return {
        epicKey,
        summary: epic?.summary ?? 'Work not linked to an epic',
        authorizedAt: toDay(epic?.authorizedAt),
        releasedAt: toDay(epic?.releasedAt),
        releaseSource: epic?.releaseSource ?? null,
        stageAtQuarterEnd: epic ? stageAt(epic, new Date(end.getTime() - 1)) : null,
        issueCount: its.length,
        capex: sum(its, (r) => r.quarterCapex),
        opex: sum(its, (r) => r.quarterOpex),
        capexToDate,
        amortization: amort.inQuarter,
        accumulatedAmortization: amort.accumulated,
        netBookValue: round2(capexToDate - amort.accumulated),
        reviewCount: its.filter((r) => r.needsReview).length,
      };
    })
    .filter((a) => a.epicKey !== null || a.issueCount > 0);

  const capex = sum(assets, (a) => a.capex);
  const opex = sum(assets, (a) => a.opex);

  return {
    quarter,
    currency: s.currency,
    totals: {
      capex,
      opex,
      total: round2(capex + opex),
      capitalizationRate: capex + opex > 0 ? round2(capex / (capex + opex)) : 0,
      amortization: sum(assets, (a) => a.amortization),
      netBookValue: sum(assets, (a) => a.netBookValue),
      estimatedCost: sum(rows, (r) => sum(r.entries.filter((e) => e.estimated && inQuarter(e)), (e) => e.cost)),
      // How much higher operating income is than if every cost were expensed: cost moved to the
      // balance sheet this quarter, minus amortization flowing back through the P&L.
      operatingIncomeEffect: round2(capex - sum(assets, (a) => a.amortization)),
    },
    assets,
    reviewQueue: rows
      .filter((r) => r.needsReview && (r.activeInQuarter || r.entries.length === 0))
      .map(({ key, summary, issueType, epicKey, confidence, reasons, quarterCapex, quarterOpex }) => ({
        key, summary, issueType, epicKey, confidence, reasons, quarterCapex, quarterOpex,
      })),
    issues: rows.filter((r) => r.activeInQuarter),
  };
}
