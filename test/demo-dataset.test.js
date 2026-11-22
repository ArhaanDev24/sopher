import { test } from 'node:test';
import assert from 'node:assert/strict';

import { currentDemoDataset, demoAsEngineInput, DEMO_DATASET, shiftDataset } from '../src/data/demo-dataset.js';
import { buildSchedule } from '../src/engine/schedule.js';

const settings = { defaultHourlyRate: 95, usefulLifeMonths: 36 };
const schedule = (quarter, dataset = DEMO_DATASET) =>
  buildSchedule({ ...demoAsEngineInput({ dataset }), settings, quarter });
const asset = (s, summary) => s.assets.find((a) => a.summary === summary);

test('demo Q3: development-stage work is capitalized, spike and bugs expensed', () => {
  const s = schedule('2026-Q3');
  assert.equal(s.totals.capex, 17860);
  assert.equal(s.totals.opex, 3800);
  assert.equal(asset(s, 'Instant payouts').capex, 12540);
  assert.equal(asset(s, 'Fraud rules engine').opex, 1900); // spike + pre-authorization research
  assert.deepEqual(s.reviewQueue.map((r) => r.summary), ['Merchant onboarding checklist']);
});

test('demo Q4: payouts released and amortizing, fraud still capitalizing, estimate flagged', () => {
  const s = schedule('2026-Q4');
  const payouts = asset(s, 'Instant payouts');
  assert.equal(payouts.stageAtQuarterEnd, 'post-implementation');
  assert.equal(payouts.capexToDate, 14820);
  assert.equal(payouts.amortization, 823.33); // 14820 / 36 for Nov and Dec
  assert.equal(asset(s, 'Fraud rules engine').capex, 11780);
  assert.equal(s.totals.estimatedCost, 2280);
  assert.deepEqual(s.reviewQueue.map((r) => r.summary).sort(), ['Merchant onboarding checklist', 'Partner usage reports']);
});

test('shifting by whole quarters keeps every figure', () => {
  const shifted = shiftDataset(DEMO_DATASET, 6);
  const a = schedule('2026-Q3');
  const b = buildSchedule({
    ...demoAsEngineInput({ dataset: shifted, created: '2027-05-20T10:00:00.000+0000' }),
    settings,
    quarter: '2027-Q1',
  });
  assert.deepEqual(b.totals, a.totals);
});

test('currentDemoDataset never puts time logs in the future', () => {
  for (const now of ['2026-11-22', '2027-01-05', '2027-02-20', '2027-03-31', '2028-06-01']) {
    const { dataset, shiftMonths } = currentDemoDataset(new Date(`${now}T12:00:00Z`));
    assert.equal(shiftMonths % 3, 0);
    const latest = dataset.issues.flatMap((i) => i.worklogs.map((w) => w.started.slice(0, 10))).sort().at(-1);
    assert.ok(latest <= now, `${now}: latest log ${latest}`);
  }
  assert.equal(currentDemoDataset(new Date('2027-01-05T00:00:00Z')).shiftMonths, 0);
  assert.equal(currentDemoDataset(new Date('2027-02-20T00:00:00Z')).shiftMonths, 3);
});
