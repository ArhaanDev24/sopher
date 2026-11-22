import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMemo, xml } from '../src/engine/memo.js';
import { buildSchedule } from '../src/engine/schedule.js';
import { mergeSettings } from '../src/engine/classify.js';
import { demoAsEngineInput } from '../src/data/demo-dataset.js';

const settings = mergeSettings({ defaultHourlyRate: 95 });
const schedule = (quarter) => ({
  projectKey: 'DEMO',
  ...buildSchedule({ ...demoAsEngineInput(), settings, quarter }),
});

test('memo carries the quarter figures, assets and review items', () => {
  const { title, body } = buildMemo(schedule('2026-Q4'), settings, {
    generatedAt: new Date('2026-12-01T00:00:00Z'),
    siteUrl: 'https://example.atlassian.net',
  });
  assert.equal(title, 'Software capitalization memo: DEMO 2026-Q4');
  for (const expected of ['$12,540.00', '$4,940.00', '72%', '$823.33', 'Instant payouts', 'Post-implementation',
    'Partner usage reports', 'Merchant onboarding checklist', '$2,280.00', 'https://example.atlassian.net/browse/DEMO-1',
    'over 36 months', '2026-12-01']) {
    assert.ok(body.includes(expected), `missing ${expected}`);
  }
});

test('memo body is well-formed enough for Confluence storage format', () => {
  const { body } = buildMemo(schedule('2026-Q3'), settings);
  for (const tag of ['table', 'tbody', 'tr', 'ul', 'li', 'ac:structured-macro', 'ac:rich-text-body']) {
    const open = (body.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length;
    const close = (body.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
    assert.equal(open, close, `<${tag}> open ${open} vs close ${close}`);
  }
  assert.ok(!body.includes('Items needing review</h2><p>None'), 'Q3 has a review item');
});

test('user text is escaped', () => {
  assert.equal(xml('R&D <beta> "x"'), 'R&amp;D &lt;beta&gt; &quot;x&quot;');
  const s = schedule('2026-Q3');
  s.assets[0].summary = 'Payouts <script>';
  assert.ok(!buildMemo(s, settings).body.includes('<script>'));
});
