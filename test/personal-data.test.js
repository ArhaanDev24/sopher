import { test } from 'node:test';
import assert from 'node:assert/strict';

import { accountsToReport, applyAccountUpdates, FORMER_USER } from '../src/engine/personal-data.js';
import { classifyIssue } from '../src/engine/classify.js';

const overrides = {
  'PAY-1': { treatment: 'capex', reason: 'Build work', byAccountId: 'acc-1', byName: 'Dana', at: '2026-10-01T10:00:00.000Z' },
  'PAY-2': { treatment: 'opex', reason: 'Support', byAccountId: 'acc-1', byName: 'Dana', at: '2026-11-02T10:00:00.000Z' },
  'PAY-3': { treatment: 'capex', reason: 'Feature', byAccountId: 'acc-2', byName: 'Sam', at: '2026-09-15T10:00:00.000Z' },
  'PAY-4': { treatment: 'opex', reason: 'Old record', byAccountId: null, byName: FORMER_USER, at: '2026-08-01T10:00:00.000Z' },
};

test('reports each account once, with its latest data time', () => {
  const accounts = accountsToReport(overrides);
  assert.deepEqual(accounts.sort((a, b) => a.accountId.localeCompare(b.accountId)), [
    { accountId: 'acc-1', updatedAt: '2026-11-02T10:00:00.000Z' },
    { accountId: 'acc-2', updatedAt: '2026-09-15T10:00:00.000Z' },
  ]);
  assert.deepEqual(accountsToReport({}), []);
});

test('closed accounts are removed but decisions and reasons are kept', () => {
  const now = new Date('2026-12-01T00:00:00Z');
  const { overrides: next, closed, updated } = applyAccountUpdates(overrides, [{ accountId: 'acc-1', status: 'closed' }], {}, now);
  assert.equal(closed, 2);
  assert.equal(updated, 0);
  for (const key of ['PAY-1', 'PAY-2']) {
    assert.equal(next[key].byAccountId, null);
    assert.equal(next[key].byName, FORMER_USER);
    assert.equal(next[key].anonymizedAt, '2026-12-01T00:00:00.000Z');
  }
  assert.equal(next['PAY-1'].reason, 'Build work');
  assert.equal(next['PAY-1'].treatment, 'capex');
  assert.equal(next['PAY-3'], overrides['PAY-3']); // untouched
  assert.ok(!JSON.stringify(next).includes('acc-1'));
  // Anonymized overrides no longer reported.
  assert.deepEqual(accountsToReport(next).map((a) => a.accountId), ['acc-2']);
});

test('updated accounts get a fresh name and a new data time', () => {
  const now = new Date('2026-12-01T00:00:00Z');
  const { overrides: next, updated } = applyAccountUpdates(overrides, [{ accountId: 'acc-2', status: 'updated' }], { 'acc-2': 'Samira' }, now);
  assert.equal(updated, 1);
  assert.equal(next['PAY-3'].byName, 'Samira');
  assert.equal(next['PAY-3'].byAccountId, 'acc-2');
  assert.deepEqual(accountsToReport(next).find((a) => a.accountId === 'acc-2').updatedAt, '2026-12-01T00:00:00.000Z');
});

test('an anonymized override still classifies, credited to a former user', () => {
  const issue = { key: 'PAY-4', summary: 'x', issueType: 'Bug', epicKey: null, labels: [], worklogs: [{ accountId: 'w', started: '2026-09-01', seconds: 3600 }] };
  const c = classifyIssue(issue, null, { defaultHourlyRate: 100 }, overrides['PAY-4']);
  assert.equal(c.treatment, 'opex');
  assert.match(c.reasons[0], /Former user/);
});
