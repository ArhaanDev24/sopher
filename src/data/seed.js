// "Load demo data": writes the demo dataset into an existing Jira project, so judges and new users
// can try Sopher on an empty site. Everything it creates carries the sopher-demo label.
//
// It adapts to the project: it maps issue types to what the project has, and drops optional
// fields (labels, estimate, fixVersion) when the project's create screen doesn't accept them.

import api, { route } from '@forge/api';
import { currentDemoDataset, DEMO_LABEL } from './demo-dataset.js';
import { setEpicMeta } from './jira.js';

const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' };

async function call(requester, path, { method = 'GET', body } = {}) {
  const res = await requester.requestJira(path, { method, headers: JSON_HEADERS, body: body && JSON.stringify(body) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = [...(data.errorMessages ?? []), ...Object.values(data.errors ?? {})].join(' ') || text.slice(0, 200);
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status;
    err.fields = Object.keys(data.errors ?? {});
    throw err;
  }
  return data;
}

/** Runs fn over items with at most `limit` requests in flight. Forge resolvers have a short time limit. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function issueTypesFor(requester, projectKey) {
  const data = await call(requester, route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes?maxResults=100`);
  const types = (data.issueTypes ?? data.values ?? []).filter((t) => !t.subtask);
  const byName = (name) => types.find((t) => t.name.toLowerCase() === name);
  const epic = byName('epic') ?? types.find((t) => t.hierarchyLevel === 1);
  const task = byName('task') ?? byName('story');
  const story = byName('story') ?? task;
  const bug = byName('bug') ?? task;
  if (!epic) throw new Error(`Project ${projectKey} has no Epic issue type, so the demo can't be loaded there.`);
  if (!task) throw new Error(`Project ${projectKey} has no Story or Task issue type.`);
  return { epic, story, bug, task };
}

/** Creates an issue. If Jira rejects an optional field (not on the create screen), retries without it. */
async function createIssue(requester, fields, optional, warnings) {
  let attempt = { ...fields, ...optional };
  for (let i = 0; i <= Object.keys(optional).length; i += 1) {
    try {
      return await call(requester, route`/rest/api/3/issue`, { method: 'POST', body: { fields: attempt } });
    } catch (err) {
      const rejected = err.status === 400 ? err.fields.filter((f) => f in optional && f in attempt) : [];
      if (rejected.length === 0) throw err;
      for (const f of rejected) {
        delete attempt[f];
        warnings.add(`The project's create screen doesn't accept "${f}", so it was left out.`);
      }
      attempt = { ...attempt };
    }
  }
  throw new Error('Could not create a demo issue.');
}

/** Demo issues already in the project (from an earlier or interrupted run), by summary. */
async function existingDemoIssues(requester, projectKey) {
  const data = await call(requester, route`/rest/api/3/search/jql`, {
    method: 'POST',
    body: { jql: `project = "${projectKey}" AND labels = "${DEMO_LABEL}"`, fields: ['summary', 'worklog'], maxResults: 100 },
  });
  return new Map((data.issues ?? []).map((i) => [i.fields.summary, {
    key: i.key,
    loggedDays: new Set((i.fields.worklog?.worklogs ?? []).map((w) => String(w.started).slice(0, 10))),
  }]));
}

async function ensureRelease(requester, project, release) {
  const versions = await call(requester, route`/rest/api/3/project/${project.key}/versions`);
  const found = versions.find((v) => v.name === release.name);
  if (found) return found;
  return call(requester, route`/rest/api/3/version`, {
    method: 'POST',
    body: { name: release.name, projectId: Number(project.id), released: true, releaseDate: release.releaseDate },
  });
}

/**
 * Seeds the demo into `projectKey`. Returns counts and any warnings.
 * @param {string} projectKey
 * @param {{ now?: Date, requester?: object }} [opts]
 */
export async function seedDemoData(projectKey, { now = new Date(), requester = api.asUser() } = {}) {
  const warnings = new Set();
  const project = await call(requester, route`/rest/api/3/project/${projectKey}`);
  const { dataset, shiftMonths } = currentDemoDataset(now);
  // Resumable: anything an earlier run already created is reused, so a failed run can just be retried.
  const existing = await existingDemoIssues(requester, project.key);
  const missingLog = (issue) => issue.worklogs.some((w) => !existing.get(issue.summary)?.loggedDays.has(w.started.slice(0, 10)));
  const complete = [...dataset.epics, ...dataset.issues].every((x) => existing.has(x.summary))
    && !dataset.issues.some(missingLog);
  if (complete) {
    return {
      alreadyLoaded: true,
      resumed: false,
      projectKey: project.key,
      epics: dataset.epics.length,
      issues: dataset.issues.length,
      worklogs: dataset.issues.reduce((n, i) => n + i.worklogs.length, 0),
      shiftedMonths: shiftMonths,
      warnings: [],
    };
  }
  const types = await issueTypesFor(requester, project.key);
  const base = { project: { key: project.key } };

  // Epics, plus their release (fixVersion) when they have one.
  const epicKeys = new Map();
  for (const epic of dataset.epics) {
    const optional = { labels: [DEMO_LABEL] };
    let version = null;
    if (epic.release) {
      try {
        version = await ensureRelease(requester, project, epic.release);
        optional.fixVersions = [{ id: version.id }];
      } catch (err) {
        warnings.add(`Couldn't create the release "${epic.release.name}" (${err.message}). Its date is stored on the epic instead.`);
      }
    }
    const created = existing.get(epic.summary)
      ?? await createIssue(requester, { ...base, issuetype: { id: types.epic.id }, summary: epic.summary }, optional, warnings);
    epicKeys.set(epic.ref, created.key);
    await setEpicMeta(created.key, {
      authorizedAt: epic.authorizedAt ?? null,
      // Only needed when the fixVersion couldn't be attached. Otherwise Jira's release date is used.
      ...(epic.release && !version ? { releasedAt: epic.release.releaseDate } : {}),
      demo: true,
    }, requester);
  }

  // Child issues.
  // One at a time, in dataset order, so issue keys are the same on every site (DEMO-4 is always
  // "Payout API endpoints"), which keeps the judge instructions and video script accurate.
  const created = await mapLimit(dataset.issues, 1, async (issue) => {
    if (existing.has(issue.summary)) return existing.get(issue.summary);
    const optional = { labels: [DEMO_LABEL, ...(issue.labels ?? [])] };
    if (issue.originalEstimateHours) optional.timetracking = { originalEstimate: `${issue.originalEstimateHours}h` };
    const fields = { ...base, issuetype: { id: types[issue.type].id }, summary: issue.summary };
    if (issue.epic) fields.parent = { key: epicKeys.get(issue.epic) };
    return createIssue(requester, fields, optional, warnings);
  });

  // Time logs, dated in the past so they fall into the right quarters.
  const logs = dataset.issues.flatMap((issue, i) => issue.worklogs
    .filter((w) => !existing.get(issue.summary)?.loggedDays.has(w.started.slice(0, 10)))
    .map((w) => ({ key: created[i].key, ...w })));
  try {
    await mapLimit(logs, 5, (w) => call(
      requester,
      route`/rest/api/3/issue/${w.key}/worklog?adjustEstimate=leave&notifyUsers=false`,
      { method: 'POST', body: { started: w.started, timeSpentSeconds: Math.round(w.hours * 3600) } },
    ));
  } catch (err) {
    throw new Error(`Issues were created, but logging time failed: ${err.message}. Check that time tracking is turned on in Jira (Settings → System → Time tracking), then click Load demo data again to finish.`);
  }

  return {
    alreadyLoaded: false,
    resumed: existing.size > 0,
    projectKey: project.key,
    epics: epicKeys.size,
    issues: created.length,
    worklogs: logs.length,
    shiftedMonths: shiftMonths,
    warnings: [...warnings],
  };
}
