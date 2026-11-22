import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyReleaseEvidence, describeEvidence, normalizeEvidence, productionReleaseAt, summarizeEvidence,
} from '../src/engine/evidence.js';
import { fetchEvidence, issueAri } from '../src/data/graph.js';

// Shape returned by the live Teamwork Graph gateway for the sopher_evidence query.
const graphData = {
  prs: { edges: [
    { node: { title: 'Payout API', status: 'MERGED', url: 'https://github.com/x/pr/1', lastUpdatedAt: '2026-08-14T10:00:00Z', provider: { name: 'GitHub' } } },
    { node: { title: 'Retry logic', status: 'OPEN', url: 'https://github.com/x/pr/2', lastUpdatedAt: '2026-09-02T10:00:00Z', provider: { name: 'GitHub' } } },
  ] },
  deployments: { edges: [
    { node: { displayName: 'staging #12', state: 'SUCCESSFUL', lastUpdatedAt: '2026-10-01T09:00:00Z', environment: { displayName: 'staging', type: 'STAGING' } } },
    { node: { displayName: 'prod #7', state: 'FAILED', lastUpdatedAt: '2026-10-03T09:00:00Z', environment: { displayName: 'prod', type: 'PRODUCTION' } } },
    { node: { displayName: 'prod #8', state: 'SUCCESSFUL', lastUpdatedAt: '2026-10-09T09:00:00Z', environment: { displayName: 'prod', type: 'PRODUCTION' } } },
    { node: { displayName: 'prod #9', state: 'SUCCESSFUL', lastUpdatedAt: '2026-10-20T09:00:00Z', environment: { displayName: 'prod', type: 'PRODUCTION' } } },
  ] },
  goals: { edges: [{ node: { name: 'Launch instant payouts', url: 'https://home.atlassian.com/goal/1' } }] },
};

test('normalizes the graph response and finds the first production release', () => {
  const e = normalizeEvidence(graphData);
  assert.equal(e.pullRequests.length, 2);
  assert.equal(e.deployments[0].environmentType, 'STAGING');
  assert.equal(productionReleaseAt(e), '2026-10-09'); // failed prod deploy and staging ignored
  assert.equal(productionReleaseAt(normalizeEvidence({})), null);
});

test('a missing release date is filled from production deployments; Jira dates win', () => {
  const evidence = { 'PAY-1': normalizeEvidence(graphData), 'PAY-2': normalizeEvidence(graphData) };
  const [a, b, c] = applyReleaseEvidence([
    { key: 'PAY-1', releasedAt: null },
    { key: 'PAY-2', releasedAt: '2026-11-01' },
    { key: 'PAY-3', releasedAt: null },
  ], evidence);
  assert.deepEqual([a.releasedAt, a.releaseSource], ['2026-10-09', 'deployment']);
  assert.deepEqual([b.releasedAt, b.releaseSource], ['2026-11-01', 'jira']);
  assert.deepEqual([c.releasedAt, c.releaseSource], [null, null]);
});

test('summaries and one-line descriptions', () => {
  const s = summarizeEvidence(normalizeEvidence(graphData));
  assert.equal(describeEvidence(s), '2 PRs (1 merged) · 2 production deployments · Goal: Launch instant payouts');
  assert.equal(describeEvidence(summarizeEvidence(normalizeEvidence({}))), 'None linked');
  assert.equal(describeEvidence(summarizeEvidence(normalizeEvidence({}, [{ message: 'boom' }]))), 'Teamwork Graph unavailable');
  assert.equal(describeEvidence(null), 'Not checked');
});

test('fetchEvidence builds the work item ARI and never throws', async () => {
  let sent;
  const ok = { requestTeamworkGraph: async (query, vars) => { sent = vars; return { json: async () => ({ data: graphData }) }; } };
  const e = await fetchEvidence({ cloudId: 'c-1', issueId: '10003' }, ok);
  assert.equal(sent.id, issueAri('c-1', '10003'));
  assert.equal(sent.id, 'ari:cloud:jira:c-1:issue/10003');
  assert.equal(e.goals[0].name, 'Launch instant payouts');

  const broken = { requestTeamworkGraph: async () => { throw new Error('network down'); } };
  const failed = await fetchEvidence({ cloudId: 'c-1', issueId: '1' }, broken);
  assert.deepEqual(failed.errors, ['network down']);
  assert.deepEqual((await fetchEvidence({}, ok)).errors, ['Missing site or issue id']);
});
