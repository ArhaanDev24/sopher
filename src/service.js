// Ties the data layer to the engine. The UI resolvers and Rovo actions both go through here,
// so the dashboard, the issue panel, the agent and MCP clients always agree on the numbers.

import { classifyIssue } from './engine/classify.js';
import { buildSchedule } from './engine/schedule.js';
import { currentQuarter, parseQuarter } from './engine/dates.js';
import { loadIssue, loadProject } from './data/jira.js';
import { getOverrides, getSettings } from './data/store.js';

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

export async function getSchedule({ projectKey, quarter }) {
  const key = normalizeProjectKey(projectKey);
  const q = normalizeQuarter(quarter);
  const [{ epics, issues }, settings, overrides] = await Promise.all([loadProject(key), getSettings(), getOverrides()]);
  return { projectKey: key, ...buildSchedule({ epics, issues, settings, overrides, quarter: q }) };
}

export async function getIssueClassification({ issueKey }) {
  const key = normalizeIssueKey(issueKey);
  const [loaded, settings, overrides] = await Promise.all([loadIssue(key), getSettings(), getOverrides()]);
  if (!loaded) throw new Error(`Issue ${key} was not found, or you don't have permission to view it.`);
  const { issue, epic } = loaded;
  return {
    epic,
    currency: settings.currency,
    override: overrides[key] ?? null,
    ...classifyIssue(issue, epic, settings, overrides[key]),
  };
}
