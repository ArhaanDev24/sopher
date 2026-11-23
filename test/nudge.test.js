import { test } from 'node:test';
import assert from 'node:assert/strict';

import { commentBody, nudgeFor } from '../src/engine/nudge.js';
import { buildSchedule } from '../src/engine/schedule.js';
import { demoAsEngineInput } from '../src/data/demo-dataset.js';

const q4 = buildSchedule({ ...demoAsEngineInput(), settings: { defaultHourlyRate: 95 }, quarter: '2026-Q4' });
const item = (summary) => q4.reviewQueue.find((r) => r.summary === summary);

test('an item with no epic asks on the item itself, with the cost at stake', () => {
  const n = nudgeFor(item('Merchant onboarding checklist'), { quarter: '2026-Q4' });
  assert.equal(n.kind, 'no-epic');
  assert.equal(n.targetKey, item('Merchant onboarding checklist').key);
  assert.match(n.message, /\$570 of work logged in 2026-Q4/);
  assert.match(n.message, /parent epic/);
});

test('work on an unauthorized epic asks on the epic for the approval date', () => {
  const r = item('Partner usage reports');
  const n = nudgeFor(r, { epicSummary: 'Partner analytics portal' });
  assert.equal(n.kind, 'not-authorized');
  assert.equal(n.targetKey, r.epicKey);
  assert.match(n.message, /"Partner analytics portal"/);
  assert.match(n.message, /approval date/);
});

test('an unusual issue type asks whether it is new functionality', () => {
  const n = nudgeFor({ key: 'X-1', epicKey: 'X-0', issueType: 'Chore', reasons: ['Issue type "Chore" isn\'t in the capitalizable list.'], quarterCapex: 190, quarterOpex: 0 });
  assert.equal(n.kind, 'unclear-type');
  assert.equal(n.targetKey, 'X-1');
  assert.match(n.message, /"Chore"/);
});

test('comment body is valid ADF', () => {
  assert.deepEqual(commentBody('hi'), { body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] } });
});
