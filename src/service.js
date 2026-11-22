// Ties the data layer to the engine. The UI resolvers and Rovo actions both go through here,
// so the dashboard, the issue panel, the agent and MCP clients always agree on the numbers.

import { classifyIssue } from './engine/classify.js';
import { buildSchedule } from './engine/schedule.js';
import { currentQuarter, parseQuarter, recentQuarters } from './engine/dates.js';
import { loadIssue, loadProject, setEpicMeta } from './data/jira.js';
import { getOverrides, getSettings } from './data/store.js';
import { buildMemo } from './engine/memo.js';
import { publishPage } from './data/confluence.js';
import api, { route } from '@forge/api';
import { applyReleaseEvidence, describeEvidence, summarizeEvidence } from './engine/evidence.js';
import { fetchEvidence, fetchEvidenceByKey } from './data/graph.js';

const PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,9}$/;
const ISSUE_KEY = /^[A-Z][A-Z0-9_]{1,9}-\d+$/;

export function normalizeProjectKey(value) {
  const key = String(value ?? '').trim().toUpperCase();
  if (!PROJECT_KEY.test(key)) throw new Error(`"${value}" is not a valid Jira project key.`);
  return key;
}

export function normalizeIssueKey(value) {
  const key = String(value ?? '').trim().toUpperCase();
  if (!ISSUE_KEY.test(key)) throw new Error(`"${value}" is not a valid Jira issue key.`);
  return key;
}

export function normalizeQuarter(value) {
  const q = String(value ?? '').trim().toUpperCase() || currentQuarter();
  parseQuarter(q); // throws a readable error if malformed
  return q;
}

export async function getSchedule({ projectKey, quarter, cloudId }) {
  const key = normalizeProjectKey(projectKey);
  const q = normalizeQuarter(quarter);
  const [{ epics: rawEpics, issues }, settings, overrides] = await Promise.all([loadProject(key), getSettings(), getOverrides()]);
  // Teamwork Graph evidence per epic (linked PRs, deployments, goals). A missing release date
  // falls back to the epic's first successful production deployment.
  const evidenceByEpic = cloudId ? await fetchEvidenceByKey(rawEpics, cloudId) : {};
  const epics = applyReleaseEvidence(rawEpics, evidenceByEpic);
  const schedule = buildSchedule({ epics, issues, settings, overrides, quarter: q });
  schedule.assets = schedule.assets.map((a) => {
    const summary = a.epicKey && cloudId ? summarizeEvidence(evidenceByEpic[a.epicKey]) : null;
    return { ...a, evidence: summary, evidenceText: a.epicKey ? describeEvidence(summary) : null };
  });
  // Last four quarters (oldest first), for the trend chart. Pure computation on data already loaded.
  const trend = recentQuarters(4, q).reverse().map((quarterKey) => {
    const { totals } = quarterKey === q ? schedule : buildSchedule({ epics, issues, settings, overrides, quarter: quarterKey });
    return { quarter: quarterKey, capex: totals.capex, opex: totals.opex, amortization: totals.amortization };
  });
  return { projectKey: key, ...schedule, trend, graphChecked: Boolean(cloudId) };
}

export async function getIssueClassification({ issueKey, cloudId }) {
  const key = normalizeIssueKey(issueKey);
  const [loaded, settings, overrides] = await Promise.all([loadIssue(key), getSettings(), getOverrides()]);
  if (!loaded) throw new Error(`Issue ${key} was not found, or you don't have permission to view it.`);
  const { issue } = loaded;
  if (loaded.asEpic) return getEpicAsset({ epic: loaded.asEpic, cloudId, currency: settings.currency });
  const [issueEvidence, epicEvidence] = await Promise.all([
    cloudId ? fetchEvidence({ cloudId, issueId: issue.id }) : null,
    cloudId && loaded.epic ? fetchEvidence({ cloudId, issueId: loaded.epic.id }) : null,
  ]);
  const epic = loaded.epic ? applyReleaseEvidence([loaded.epic], { [loaded.epic.key]: epicEvidence })[0] : null;
  return {
    epic,
    currency: settings.currency,
    override: overrides[key] ?? null,
    evidence: { issue: issueEvidence, epic: epicEvidence },
    ...classifyIssue(issue, epic, settings, overrides[key]),
  };
}

/** The software-asset view of an epic: stage, dates, cost to date, amortization and evidence. */
async function getEpicAsset({ epic, cloudId, currency }) {
  const projectKey = epic.key.split('-')[0];
  const quarter = currentQuarter();
  const [schedule, evidence] = await Promise.all([
    getSchedule({ projectKey, quarter, cloudId }),
    cloudId ? fetchEvidence({ cloudId, issueId: epic.id }) : null,
  ]);
  const asset = schedule.assets.find((a) => a.epicKey === epic.key) ?? null;
  return {
    mode: 'epic',
    key: epic.key,
    summary: epic.summary,
    currency,
    quarter,
    authorizedAt: epic.authorizedAt ? String(epic.authorizedAt).slice(0, 10) : null,
    asset,
    reviewCount: schedule.reviewQueue.filter((r) => r.epicKey === epic.key).length,
    evidence,
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Records (or clears) when an epic's project was authorized, which starts the application
 * development stage. Stored on the epic as an issue property, so Jira's edit permission applies.
 */
export async function setEpicAuthorization({ issueKey, authorizedAt }) {
  const key = normalizeIssueKey(issueKey);
  const loaded = await loadIssue(key);
  if (!loaded?.asEpic) throw new Error(`${key} is not an epic. Project authorization is set on epics.`);
  if (authorizedAt !== null && !(ISO_DAY.test(String(authorizedAt)) && !Number.isNaN(Date.parse(authorizedAt)))) {
    throw new Error('Use a date like 2026-06-01.');
  }
  if (authorizedAt && authorizedAt > new Date().toISOString().slice(0, 10)) {
    throw new Error('The authorization date can\'t be in the future.');
  }
  await setEpicMeta(key, { authorizedAt: authorizedAt ?? null });
  return { key, authorizedAt: authorizedAt ?? null };
}

const SPACE_KEY = /^[A-Za-z0-9~][A-Za-z0-9_~-]{0,254}$/;

async function siteBaseUrl() {
  const res = await api.asUser().requestJira(route`/rest/api/3/serverInfo`, { headers: { Accept: 'application/json' } });
  return res.ok ? (await res.json()).baseUrl : '';
}

/** Generates the quarter's capitalization memo and publishes it to Confluence (creates or updates). */
export async function publishMemo({ projectKey, quarter, spaceKey, cloudId }) {
  const settings = await getSettings();
  const space = String(spaceKey ?? settings.confluenceSpaceKey ?? '').trim();
  if (!space) throw new Error('No Confluence space given. Set one in Sopher settings, or pass a space key.');
  if (!SPACE_KEY.test(space)) throw new Error(`"${space}" is not a valid Confluence space key.`);
  const [schedule, siteUrl] = await Promise.all([getSchedule({ projectKey, quarter, cloudId }), siteBaseUrl()]);
  const memo = buildMemo(schedule, settings, { siteUrl });
  const page = await publishPage({ spaceKey: space, title: memo.title, body: memo.body, siteUrl });
  return { ...page, title: memo.title, spaceKey: space, projectKey: schedule.projectKey, quarter: schedule.quarter };
}
