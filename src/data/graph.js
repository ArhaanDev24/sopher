// Teamwork Graph client: linked pull requests, deployments and goals for a Jira work item,
// using Atlassian's curated queries. Runs as the current user, so results respect their
// permissions. Never throws: graph problems come back as evidence.errors, so a graph outage
// can't break the schedule.

import api from '@forge/api';
import { EMPTY_EVIDENCE, normalizeEvidence } from '../engine/evidence.js';

export const EVIDENCE_QUERY = `query sopher_evidence($id: ID!) {
  prs: jiraWorkItemLinkedExternalPullRequests(id: $id, first: 25) {
    edges { node { ... on ExternalPullRequest { id title status url lastUpdatedAt provider { name } } } }
  }
  deployments: jiraWorkItemLinkedExternalDeployments(id: $id, first: 25) {
    edges { node { ... on ExternalDeployment { id displayName state lastUpdatedAt url environment { displayName type } } } }
  }
  goals: jiraWorkItemGoals(id: $id, first: 25) {
    edges { node { ... on AtlassianGoal { id name url } } }
  }
}`;

export const issueAri = (cloudId, issueId) => `ari:cloud:jira:${cloudId}:issue/${issueId}`;

/**
 * @param {{ cloudId: string, issueId: string }} target
 * @returns {Promise<object>} normalized evidence
 */
// Teamwork Graph is in preview and can be slow. Forge functions stop after 25 seconds, so evidence
// gets a fixed budget: past it, the schedule loads without evidence instead of failing.
export const GRAPH_TIMEOUT_MS = 8000;

export function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function fetchEvidence({ cloudId, issueId }, requester = api.asUser(), { timeoutMs = GRAPH_TIMEOUT_MS } = {}) {
  if (!cloudId || !issueId) return { ...EMPTY_EVIDENCE, errors: ['Missing site or issue id'] };
  try {
    const body = await withTimeout(
      requester.requestTeamworkGraph(EVIDENCE_QUERY, { id: issueAri(cloudId, issueId) }).then((res) => res.json()),
      timeoutMs,
      'Teamwork Graph',
    );
    return normalizeEvidence(body.data, body.errors ?? []);
  } catch (err) {
    console.error('[graph] evidence query failed', err.message);
    return { ...EMPTY_EVIDENCE, errors: [err.message] };
  }
}

/** Evidence for several work items at once, keyed by issue key. */
export async function fetchEvidenceByKey(items, cloudId, requester = api.asUser()) {
  const entries = await Promise.all(items.map(async (item) => [item.key, await fetchEvidence({ cloudId, issueId: item.id }, requester)]));
  return Object.fromEntries(entries);
}
