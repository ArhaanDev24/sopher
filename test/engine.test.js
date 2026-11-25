import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyIssue, stageAt, STAGE } from '../src/engine/classify.js';
import { buildSchedule } from '../src/engine/schedule.js';
import { parseDate, parseQuarter, quarterOf, recentQuarters } from '../src/engine/dates.js';

const h = (hours) => hours * 3600;
const settings = { defaultHourlyRate: 100, usefulLifeMonths: 36 };

const epic = { key: 'PAY-1', summary: 'Instant payouts', authorizedAt: '2026-08-01T00:00:00.000+0000', releasedAt: '2026-11-15' };

const story = {
  key: 'PAY-2', summary: 'Payout API', issueType: 'Story', epicKey: 'PAY-1', labels: [], created: '2026-07-15',
  worklogs: [
    { accountId: 'bob', started: '2026-07-20T09:00:00.000+0000', seconds: h(4) }, // preliminary
    { accountId: 'bob', started: '2026-08-10T09:00:00.000+0000', seconds: h(10) }, // development
    { accountId: 'bob', started: '2026-11-20T09:00:00.000+0000', seconds: h(2) }, // post-implementation
  ],
};
const bug = {
  key: 'PAY-3', summary: 'Fix rounding', issueType: 'Bug', epicKey: 'PAY-1', labels: [], created: '2026-08-30',
  worklogs: [{ accountId: 'bob', started: '2026-09-01T09:00:00.000+0000', seconds: h(3) }],
};
const orphan = {
  key: 'PAY-4', summary: 'Loose story', issueType: 'Story', epicKey: null, labels: [], created: '2026-09-01',
  worklogs: [{ accountId: 'bob', started: '2026-09-05T09:00:00.000+0000', seconds: h(1) }],
};
const estimated = {
  key: 'PAY-5', summary: 'Payout webhooks', issueType: 'Story', epicKey: 'PAY-1', labels: [], created: '2026-09-10T10:00:00.000+0000',
  originalEstimateSeconds: h(8), worklogs: [],
};

test('dates: Jira offsets, quarters', () => {
  assert.equal(parseDate('2026-10-03T09:00:00.000+0000').toISOString(), '2026-10-03T09:00:00.000Z');
  assert.equal(quarterOf('2026-11-30'), '2026-Q4');
  assert.deepEqual(recentQuarters(3, '2026-Q1'), ['2026-Q1', '2025-Q4', '2025-Q3']);
  assert.throws(() => parseQuarter('Q3 2026'), /Invalid quarter/);
});

test('stageAt follows the authorization and release window', () => {
  assert.equal(stageAt(epic, '2026-07-31'), STAGE.PRELIMINARY);
  assert.equal(stageAt(epic, '2026-08-01'), STAGE.DEVELOPMENT);
  assert.equal(stageAt(epic, '2026-11-15'), STAGE.POST);
  assert.equal(stageAt({ key: 'X' }, '2026-09-01'), STAGE.PRELIMINARY);
});

test('feature work is split by stage per worklog', () => {
  const c = classifyIssue(story, epic, settings);
  assert.equal(c.treatment, 'mixed');
  assert.equal(c.capex, 1000);
  assert.equal(c.opex, 600);
  assert.deepEqual(c.entries.map((e) => e.stage), [STAGE.PRELIMINARY, STAGE.DEVELOPMENT, STAGE.POST]);
  assert.equal(c.confidence, 'high');
  assert.equal(c.needsReview, false);
});

test('bugs are expensed even in the development stage', () => {
  const c = classifyIssue(bug, epic, settings);
  assert.equal(c.treatment, 'opex');
  assert.equal(c.basis, 'maintenance');
  assert.equal(c.opex, 300);
});

test('maintenance and research labels force opex', () => {
  assert.equal(classifyIssue({ ...story, labels: ['Tech-Debt'] }, epic, settings).treatment, 'opex');
  assert.equal(classifyIssue({ ...story, labels: ['spike'] }, epic, settings).basis, 'research');
});

test('missing epic or authorization goes to review, expensed', () => {
  const noEpic = classifyIssue(orphan, null, settings);
  assert.equal(noEpic.treatment, 'opex');
  assert.equal(noEpic.needsReview, true);
  assert.equal(noEpic.confidence, 'low');

  const unauthorized = classifyIssue(story, { key: 'PAY-1', summary: 'x' }, settings);
  assert.equal(unauthorized.capex, 0);
  assert.equal(unauthorized.needsReview, true);
});

test('original estimate is used when no time is logged', () => {
  const c = classifyIssue(estimated, epic, settings);
  assert.equal(c.capex, 800);
  assert.equal(c.entries[0].estimated, true);
  assert.equal(c.confidence, 'medium');
});

test('per-person rates and overrides', () => {
  const rated = classifyIssue(bug, epic, { ...settings, ratesByAccountId: { bob: 150 } });
  assert.equal(rated.opex, 450);

  const o = classifyIssue(bug, epic, settings, { treatment: 'capex', reason: 'Part of the payout build', byName: 'Dana', at: '2026-10-01' });
  assert.equal(o.treatment, 'capex');
  assert.equal(o.capex, 300);
  assert.equal(o.overridden, true);
  assert.match(o.reasons[0], /Dana/);
});

test('Q3 schedule: totals, unlinked bucket, review queue', () => {
  const s = buildSchedule({ epics: [epic], issues: [story, bug, orphan, estimated], settings, quarter: '2026-Q3' });
  const pay = s.assets.find((a) => a.epicKey === 'PAY-1');
  assert.equal(pay.capex, 1800);
  assert.equal(pay.opex, 700);
  assert.equal(pay.amortization, 0);
  assert.equal(s.totals.capex, 1800);
  assert.equal(s.totals.opex, 800);
  assert.equal(s.totals.capitalizationRate, 0.69);
  assert.equal(s.totals.estimatedCost, 800);
  assert.deepEqual(s.reviewQueue.map((r) => r.key), ['PAY-4']);
  assert.equal(s.assets.find((a) => a.epicKey === null).opex, 100);
});

test('Q4 schedule: amortization starts the month after release', () => {
  const s = buildSchedule({ epics: [epic], issues: [story, bug, orphan, estimated], settings, quarter: '2026-Q4' });
  const pay = s.assets.find((a) => a.epicKey === 'PAY-1');
  assert.equal(pay.capex, 0);
  assert.equal(pay.opex, 200);
  assert.equal(pay.capexToDate, 1800);
  assert.equal(pay.amortization, 50); // 1800 / 36 for December only
  assert.equal(pay.netBookValue, 1750);
  assert.equal(pay.stageAtQuarterEnd, STAGE.POST);
  assert.deepEqual(s.reviewQueue, []);
});

test('estimated cost is attributed to the epic it belongs to', async () => {
  const { buildSchedule } = await import('../src/engine/schedule.js');
  const { demoAsEngineInput } = await import('../src/data/demo-dataset.js');
  const s = buildSchedule({ ...demoAsEngineInput(), settings: { defaultHourlyRate: 95 }, overrides: {}, quarter: '2026-Q4' });
  const byKey = Object.fromEntries(s.assets.map((a) => [a.epicKey, a]));
  assert.equal(byKey['DEMO-2'].estimatedCost, 2280); // DEMO-15 Fraud case export: 24h estimate, no time logged
  assert.equal(byKey['DEMO-3'].estimatedCost, 0);
  assert.equal(s.totals.estimatedCost, 2280);
});
