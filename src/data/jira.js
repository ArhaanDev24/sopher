// Jira data layer: loads epics, child issues and worklogs, then normalizes them into the
// shapes the engine expects (see src/engine/classify.js).
//
// Epic metadata that Jira has no native field for (project authorization date, linked spec) lives
// in an issue entity property called "sopher" on the epic: { authorizedAt, releasedAt?, specPageId? }.
// The release date otherwise comes from the epic's earliest released fixVersion.

import api, { route } from '@forge/api';

export const EPIC_PROPERTY = 'sopher';

const ISSUE_FIELDS = [
  'summary', 'issuetype', 'labels', 'created', 'resolutiondate', 'parent',
  'timeoriginalestimate', 'assignee', 'status', 'worklog', 'fixVersions',
];

async function jira(requester, path, options = {}) {
  const res = await requester.requestJira(path, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  // Some writes (e.g. setting an issue property) succeed with an empty body.
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/** All issues matching a JQL query, following nextPageToken pagination. */
async function searchAll(requester, jql, fields = ISSUE_FIELDS) {
  const issues = [];
  let nextPageToken;
  do {
    const page = await jira(requester, route`/rest/api/3/search/jql`, {
      method: 'POST',
      body: JSON.stringify({ jql, fields, maxResults: 100, nextPageToken }),
    });
    issues.push(...(page?.issues ?? []));
    nextPageToken = page?.isLast === false ? page.nextPageToken : undefined;
  } while (nextPageToken);
  return issues;
}

/** The search response embeds at most ~20 worklogs. Fetch the rest when there are more. */
async function fullWorklogs(requester, raw) {
  const wl = raw.fields.worklog;
  if (!wl || wl.total <= (wl.worklogs?.length ?? 0)) return wl?.worklogs ?? [];
  const all = [];
  let startAt = 0;
  while (true) {
    const page = await jira(requester, route`/rest/api/3/issue/${raw.key}/worklog?startAt=${startAt}&maxResults=1000`);
    const batch = page?.worklogs ?? [];
    all.push(...batch);
    startAt += batch.length;
    if (batch.length === 0 || startAt >= (page?.total ?? 0)) break;
  }
  return all;
}

async function epicProperty(requester, epicKey) {
  const prop = await jira(requester, route`/rest/api/3/issue/${epicKey}/properties/${EPIC_PROPERTY}`);
  return prop?.value ?? {};
}

function releaseDateOf(raw) {
  const dates = (raw.fields.fixVersions ?? [])
    .filter((v) => v.released && v.releaseDate)
    .map((v) => v.releaseDate)
    .sort();
  return dates[0] ?? null;
}

async function normalizeEpic(requester, raw) {
  const meta = await epicProperty(requester, raw.key);
  return {
    key: raw.key,
    summary: raw.fields.summary,
    status: raw.fields.status?.name ?? null,
    authorizedAt: meta.authorizedAt ?? null,
    releasedAt: meta.releasedAt ?? releaseDateOf(raw),
    specPageId: meta.specPageId ?? null,
  };
}

async function normalizeIssue(requester, raw) {
  const f = raw.fields;
  const worklogs = await fullWorklogs(requester, raw);
  return {
    key: raw.key,
    summary: f.summary,
    issueType: f.issuetype?.name ?? 'Unknown',
    status: f.status?.name ?? null,
    parentKey: f.parent?.key ?? null,
    epicKey: null, // resolved by resolveEpicKeys
    labels: f.labels ?? [],
    created: f.created,
    resolved: f.resolutiondate ?? null,
    assigneeAccountId: f.assignee?.accountId ?? null,
    assigneeName: f.assignee?.displayName ?? null,
    originalEstimateSeconds: f.timeoriginalestimate ?? 0,
    worklogs: worklogs.map((w) => ({
      accountId: w.author?.accountId ?? null,
      authorName: w.author?.displayName ?? null,
      started: w.started,
      seconds: w.timeSpentSeconds ?? 0,
    })),
  };
}

/** A story's epic is its parent. A sub-task's epic is its parent story's parent. */
function resolveEpicKeys(issues, epicKeys) {
  const byKey = new Map(issues.map((i) => [i.key, i]));
  for (const issue of issues) {
    let parent = issue.parentKey;
    for (let depth = 0; parent && depth < 3; depth += 1) {
      if (epicKeys.has(parent)) {
        issue.epicKey = parent;
        break;
      }
      parent = byKey.get(parent)?.parentKey ?? null;
    }
  }
  return issues;
}

const jqlString = (s) => `"${String(s).replace(/["\\]/g, '\\$&')}"`;

/** Loads one project's epics and non-epic issues, normalized for the engine. */
export async function loadProject(projectKey, requester = api.asUser()) {
  const project = jqlString(projectKey);
  const [rawEpics, rawIssues] = await Promise.all([
    searchAll(requester, `project = ${project} AND issuetype = Epic ORDER BY created ASC`, ['summary', 'status', 'fixVersions']),
    searchAll(requester, `project = ${project} AND issuetype != Epic ORDER BY created ASC`),
  ]);
  const epics = await Promise.all(rawEpics.map((r) => normalizeEpic(requester, r)));
  const issues = await Promise.all(rawIssues.map((r) => normalizeIssue(requester, r)));
  return { epics, issues: resolveEpicKeys(issues, new Set(epics.map((e) => e.key))) };
}

/** Loads a single issue plus its epic (walking up from a sub-task if needed). */
export async function loadIssue(issueKey, requester = api.asUser()) {
  const get = (key, fields) => jira(requester, route`/rest/api/3/issue/${key}?fields=${fields.join(',')}`);
  const raw = await get(issueKey, ISSUE_FIELDS);
  if (!raw) return null;
  const issue = await normalizeIssue(requester, raw);

  let epicRaw = null;
  let parentKey = issue.parentKey;
  for (let depth = 0; parentKey && depth < 3; depth += 1) {
    const parent = await get(parentKey, ['summary', 'status', 'fixVersions', 'issuetype', 'parent']);
    if (!parent) break;
    if (parent.fields.issuetype?.hierarchyLevel === 1 || parent.fields.issuetype?.name === 'Epic') {
      epicRaw = parent;
      break;
    }
    parentKey = parent.fields.parent?.key ?? null;
  }
  const epic = epicRaw ? await normalizeEpic(requester, epicRaw) : null;
  issue.epicKey = epic?.key ?? null;
  return { issue, epic };
}

/** Writes the epic's Sopher metadata (authorization date and so on). */
export async function setEpicMeta(epicKey, meta, requester = api.asUser()) {
  const current = await epicProperty(requester, epicKey);
  await jira(requester, route`/rest/api/3/issue/${epicKey}/properties/${EPIC_PROPERTY}`, {
    method: 'PUT',
    body: JSON.stringify({ ...current, ...meta }),
  });
}
