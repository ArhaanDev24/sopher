import { test } from 'node:test';
import assert from 'node:assert/strict';

// pickActionInputs lives in src/index.js, which imports Forge runtime modules; keep a copy of the
// contract here by reading the source, so the test doesn't need the Forge runtime.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const list = /const ACTION_INPUTS = \[([^\]]*)\]/.exec(src)[1];
const allowed = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('action logging allowlist excludes tokens and platform fields', () => {
  assert.deepEqual(allowed, ['projectKey', 'quarter', 'issueKey', 'spaceKey']);
  for (const secret of ['contextToken', 'orgId', 'context', 'accountId']) assert.ok(!allowed.includes(secret));
  assert.match(src, /const inputs = pickActionInputs\(payload\)/);
});
