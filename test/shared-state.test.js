import { test } from 'node:test';
import assert from 'node:assert/strict';

import { projectOfIssue, projectState, stateFromProperty } from '../src/engine/shared-state.js';
import { buildSchedule } from '../src/engine/schedule.js';
import { demoAsEngineInput } from '../src/data/demo-dataset.js';

const at = '2026-11-25T10:00:00.000Z';
const stored = {
  settings: { defaultHourlyRate: 95, currency: 'USD', ratesByAccountId: { 'acc-9': 140 } },
  overrides: {
    'DEMO-18': { treatment: 'capex', reason: 'Spec approved', byAccountId: 'acc-1', byName: 'Dana', at },
    'PAY-7': { treatment: 'opex', reason: 'Other project', byAccountId: 'acc-2', byName: 'Lee', at },
  },
  closes: {
    'DEMO:2026-Q4': { quarter: '2026-Q4', at, byAccountId: 'acc-1', byName: 'Dana', totals: { capex: 1 }, issues: {} },
    'PAY:2026-Q4': { quarter: '2026-Q4', at, byAccountId: 'acc-2', byName: 'Lee', totals: {}, issues: {} },
  },
  nudges: { 'DEMO-19': { kind: 'no-epic', at }, 'PAY-1': { kind: 'no-epic', at } },
};

test('projectOfIssue handles underscores and digits in keys', () => {
  assert.equal(projectOfIssue('DEMO-4'), 'DEMO');
  assert.equal(projectOfIssue('FIN_2-120'), 'FIN_2');
});

test('shared state keeps only the project and never account IDs or personal rates', () => {
  const state = projectState('DEMO', stored, at);
  assert.deepEqual(Object.keys(state.overrides), ['DEMO-18']);
  assert.deepEqual(Object.keys(state.closes), ['DEMO:2026-Q4']);
  assert.deepEqual(Object.keys(state.nudges), ['DEMO-19']);
  assert.equal(state.personalRatesOmitted, 1);
  assert.equal(state.settings.ratesByAccountId, undefined);
  const json = JSON.stringify(state);
  assert.ok(!json.includes('acc-'), 'no account IDs in the shared copy');
  assert.equal(state.overrides['DEMO-18'].byName, 'Dana'); // shown in the override reason
});

test('a shared override changes the schedule exactly like the local one', () => {
  const read = stateFromProperty(JSON.parse(JSON.stringify(projectState('DEMO', stored, at))));
  const input = demoAsEngineInput();
  const local = buildSchedule({ ...input, settings: { defaultHourlyRate: 95 }, overrides: { 'DEMO-18': stored.overrides['DEMO-18'] }, quarter: '2026-Q4' });
  const shared = buildSchedule({ ...input, settings: read.settings, overrides: read.overrides, quarter: '2026-Q4' });
  assert.deepEqual(shared.totals, local.totals);
  assert.equal(shared.totals.capex, 12540 + 1710); // DEMO-18's 18h moved to capitalized
});

test('unknown or missing property values are ignored', () => {
  assert.equal(stateFromProperty(null), null);
  assert.equal(stateFromProperty({ version: 99 }), null);
});
