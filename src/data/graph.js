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
export async function fetchEvidence({ cloudId, issueId }, requester = api.asUser()) {
  if (!cloudId || !issueId) return { ...EMPTY_EVIDENCE, errors: ['Missing site or issue id'] };
  try {
    const res = await requester.requestTeamworkGraph(EVIDENCE_QUERY, { id: issueAri(cloudId, issueId) });
    const body = await res.json();
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
