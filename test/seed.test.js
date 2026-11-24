import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seedDemoData } from '../src/data/seed.js';
import { DEMO_DATASET } from '../src/data/demo-dataset.js';

/** In-memory Jira that understands just the endpoints the seeder calls. */
function fakeJira({ failPropertyOnce = false } = {}) {
  const issues = new Map();
  const versions = [];
  let n = 0;
  let propertyFailures = failPropertyOnce ? 1 : 0;
  const reply = (status, body) => ({
    ok: status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  });

  const requestJira = async (path, opts = {}) => {
    const url = String(path.value ?? path);
    const method = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (url === '/rest/api/3/project/DEMO') return reply(200, { id: '10000', key: 'DEMO' });
    if (url.startsWith('/rest/api/3/issue/createmeta/DEMO/issuetypes')) {
      return reply(200, { issueTypes: [
        { id: '1', name: 'Epic', hierarchyLevel: 1 }, { id: '5', name: 'Feature', hierarchyLevel: 1 },
        { id: '2', name: 'Story', hierarchyLevel: 0 }, { id: '3', name: 'Bug', hierarchyLevel: 0 },
        { id: '4', name: 'Task', hierarchyLevel: 0 },
      ] });
    }
    if (url === '/rest/api/3/search/jql') {
      const found = [...issues.values()].filter((i) => i.fields.labels?.includes('sopher-demo'));
      return reply(200, { issues: found.map((i) => ({ key: i.key, fields: { summary: i.fields.summary, worklog: { worklogs: i.worklogs } } })) });
    }
    if (url === '/rest/api/3/project/DEMO/versions') return reply(200, versions);
    if (url === '/rest/api/3/version') {
      const v = { id: String(100 + versions.length), ...body };
      versions.push(v);
      return reply(201, v);
    }
    if (url === '/rest/api/3/issue' && method === 'POST') {
      n += 1;
      const key = `DEMO-${n}`;
      issues.set(key, { key, fields: body.fields, worklogs: [], props: {} });
      return reply(201, { key });
    }
    let m = /^\/rest\/api\/3\/issue\/([^/]+)\/properties\/sopher$/.exec(url);
    if (m) {
      const issue = issues.get(m[1]);
      if (method === 'GET') return issue.props.sopher ? reply(200, { value: issue.props.sopher }) : reply(404, {});
      if (propertyFailures > 0) {
        propertyFailures -= 1;
        throw new Error('simulated crash');
      }
      issue.props.sopher = body;
      return reply(200); // Jira returns an empty body here
    }
    m = /^\/rest\/api\/3\/issue\/([^/]+)\/worklog/.exec(url);
    if (m && method === 'POST') {
      issues.get(m[1]).worklogs.push({ started: body.started, timeSpentSeconds: body.timeSpentSeconds });
      return reply(201, {});
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  };
  return { requester: { requestJira }, issues, versions };
}

const now = new Date('2026-11-22T12:00:00Z');
const totalLogs = DEMO_DATASET.issues.reduce((a, i) => a + i.worklogs.length, 0);

test('seeds epics, issues, release and time logs', async () => {
  const jira = fakeJira();
  const result = await seedDemoData('DEMO', { now, requester: jira.requester });
  assert.equal(result.epics, 3);
  assert.equal(result.issues, 16);
  assert.equal(result.worklogs, totalLogs);
  assert.equal(jira.versions.length, 1);
  const all = [...jira.issues.values()];
  const epics = all.filter((i) => i.fields.issuetype.id === '1');
  assert.equal(epics.length, 3, 'uses Epic, not Feature');
  assert.equal(epics.find((e) => e.fields.summary === 'Instant payouts').props.sopher.authorizedAt, '2026-06-01');
  assert.equal(all.find((i) => i.fields.summary === 'Fraud case export').fields.timetracking.originalEstimate, '24h');
  assert.equal(all.reduce((a, i) => a + i.worklogs.length, 0), totalLogs);
  // Keys are deterministic: epics DEMO-1..3, then issues in dataset order.
  assert.equal(jira.issues.get('DEMO-4').fields.summary, 'Payout API endpoints');
  assert.equal(jira.issues.get('DEMO-6').fields.summary, 'Payout status webhooks');
  assert.equal(jira.issues.get('DEMO-18').fields.summary, 'Partner usage reports');
  assert.equal(jira.issues.get('DEMO-19').fields.summary, 'Merchant onboarding checklist');
});

test('a crashed run can be retried and finishes without duplicates', async () => {
  const jira = fakeJira({ failPropertyOnce: true });
  await assert.rejects(seedDemoData('DEMO', { now, requester: jira.requester }), /simulated crash/);
  assert.equal(jira.issues.size, 1); // the first epic got created before the crash

  const result = await seedDemoData('DEMO', { now, requester: jira.requester });
  assert.equal(result.resumed, true);
  assert.equal(jira.issues.size, 19);
  assert.equal(jira.versions.length, 1);
  assert.equal([...jira.issues.values()].reduce((a, i) => a + i.worklogs.length, 0), totalLogs);

  const again = await seedDemoData('DEMO', { now, requester: jira.requester });
  assert.equal(again.alreadyLoaded, true);
  assert.equal(jira.issues.size, 19); // nothing duplicated
});
