import { test } from 'node:test';
import assert from 'node:assert/strict';

import { closeKey, diffAgainstClose, snapshotFromSchedule } from '../src/engine/close.js';
import { buildSchedule } from '../src/engine/schedule.js';
import { demoAsEngineInput } from '../src/data/demo-dataset.js';

const settings = { defaultHourlyRate: 95 };
const schedule = (overrides = {}, mutate = (d) => d) => ({
  projectKey: 'DEMO',
  ...buildSchedule({ ...mutate(demoAsEngineInput()), settings, overrides, quarter: '2026-Q3' }),
});
const who = { at: '2026-10-05T09:00:00.000Z', byAccountId: 'acc-1', byName: 'Dana' };

test('snapshot keeps totals and per-issue amounts compactly', () => {
  const snap = snapshotFromSchedule(schedule(), who);
  assert.equal(snap.quarter, '2026-Q3');
  assert.equal(snap.totals.capex, 17860);
  assert.equal(snap.byName, 'Dana');
  assert.deepEqual(snap.issues['DEMO-4'], [3610, 0]); // Payout API endpoints: 38h in Q3, all capitalized
  assert.equal(closeKey('DEMO', '2026-Q3'), 'DEMO:2026-Q3');
});

test('no drift when nothing changed', () => {
  const s = schedule();
  const d = diffAgainstClose(snapshotFromSchedule(s, who), s);
  assert.equal(d.hasDrift, false);
  assert.deepEqual(d.changes, []);
});

test('an override after close shows as a post-close adjustment', () => {
  const snap = snapshotFromSchedule(schedule(), who);
  // DEMO-8 is the "Rounding error" bug: 6h expensed in Q3. A controller capitalizes it after close.
  const after = schedule({ 'DEMO-8': { treatment: 'capex', reason: 'late call', byName: 'Sam', at: '2026-10-20' } });
  const d = diffAgainstClose(snap, after);
  assert.equal(d.hasDrift, true);
  assert.deepEqual(d.totals, { capexDelta: 570, opexDelta: -570, amortizationDelta: 0 });
  assert.equal(d.changes.length, 1);
  assert.deepEqual(d.changes[0], {
    key: 'DEMO-8', summary: 'Rounding error on FX payouts',
    before: { capex: 0, opex: 570 }, after: { capex: 570, opex: 0 },
    capexDelta: 570, opexDelta: -570, kind: 'changed',
  });
});

test('a back-dated time log after close is detected as added cost', () => {
  const snap = snapshotFromSchedule(schedule(), who);
  const after = schedule({}, (d) => {
    const issue = d.issues.find((i) => i.summary === 'Velocity checks'); // fraud epic, Q4 work only
    issue.worklogs.push({ accountId: 'x', started: '2026-09-20T10:00:00.000+0000', seconds: 4 * 3600 });
    return d;
  });
  const diff = diffAgainstClose(snap, after);
  assert.equal(diff.totals.capexDelta, 380);
  assert.equal(diff.changes[0].kind, 'added');
  assert.equal(diffAgainstClose(null, after), null);
});
