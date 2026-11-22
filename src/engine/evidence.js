// Evidence from Atlassian Teamwork Graph: pull requests, deployments and goals linked to a Jira
// work item. Pure functions only. Fetching lives in src/data/graph.js.
//
// Two uses:
//   1. Audit evidence shown next to a classification (in the issue panel and the memo).
//   2. A release signal: when an epic has no release date in Jira, its first successful
//      production deployment marks when the software was placed in service.

const nodes = (conn) => (conn?.edges ?? []).map((e) => e?.node).filter(Boolean);

/** Normalizes the `sopher_evidence` GraphQL response (see EVIDENCE_QUERY in src/data/graph.js). */
export function normalizeEvidence(data, errors = []) {
  return {
    pullRequests: nodes(data?.prs).map((n) => ({
      title: n.title ?? 'Untitled pull request',
      status: n.status ?? 'UNKNOWN',
      url: n.url ?? null,
      updatedAt: n.lastUpdatedAt ?? null,
      provider: n.provider?.name ?? null,
    })),
    deployments: nodes(data?.deployments).map((n) => ({
      name: n.displayName ?? 'Deployment',
      state: n.state ?? 'UNKNOWN',
      environment: n.environment?.displayName ?? null,
      environmentType: n.environment?.type ?? 'UNMAPPED',
      at: n.lastUpdatedAt ?? null,
      url: n.url ?? null,
    })),
    goals: nodes(data?.goals).map((n) => ({ name: n.name ?? 'Goal', url: n.url ?? null })),
    errors: errors.map((e) => e?.message ?? String(e)),
  };
}

export const EMPTY_EVIDENCE = Object.freeze({ pullRequests: [], deployments: [], goals: [], errors: [] });

/** Earliest successful production deployment ("YYYY-MM-DD"), or null. */
export function productionReleaseAt(evidence) {
  const dates = (evidence?.deployments ?? [])
    .filter((d) => d.state === 'SUCCESSFUL' && d.environmentType === 'PRODUCTION' && d.at)
    .map((d) => String(d.at).slice(0, 10))
    .sort();
  return dates[0] ?? null;
}

/**
 * Fills in missing epic release dates from production deployments, and records where each
 * release date came from ("jira", "deployment", or null when unreleased).
 * @param {Array} epics normalized epics
 * @param {Record<string, object>} evidenceByEpicKey
 */
export function applyReleaseEvidence(epics, evidenceByEpicKey = {}) {
  return epics.map((epic) => {
    if (epic.releasedAt) return { ...epic, releaseSource: 'jira' };
    const deployed = productionReleaseAt(evidenceByEpicKey[epic.key]);
    return deployed
      ? { ...epic, releasedAt: deployed, releaseSource: 'deployment' }
      : { ...epic, releaseSource: null };
  });
}

/** Short counts for tables, memos and agent answers. */
export function summarizeEvidence(evidence) {
  if (!evidence) return null;
  const prs = evidence.pullRequests ?? [];
  const deps = evidence.deployments ?? [];
  return {
    pullRequests: prs.length,
    mergedPullRequests: prs.filter((p) => p.status === 'MERGED').length,
    deployments: deps.length,
    productionDeployments: deps.filter((d) => d.environmentType === 'PRODUCTION' && d.state === 'SUCCESSFUL').length,
    goals: (evidence.goals ?? []).map((g) => g.name),
    unavailable: (evidence.errors ?? []).length > 0 && prs.length + deps.length + (evidence.goals ?? []).length === 0,
  };
}

/** One-line description, e.g. "3 PRs (2 merged) · 1 production deployment · Goal: Launch payouts". */
export function describeEvidence(summary) {
  if (!summary) return 'Not checked';
  if (summary.unavailable) return 'Teamwork Graph unavailable';
  const parts = [];
  if (summary.pullRequests) parts.push(`${summary.pullRequests} PR${summary.pullRequests === 1 ? '' : 's'} (${summary.mergedPullRequests} merged)`);
  if (summary.deployments) {
    parts.push(`${summary.productionDeployments} production deployment${summary.productionDeployments === 1 ? '' : 's'}`);
  }
  if (summary.goals.length) parts.push(`Goal: ${summary.goals.join(', ')}`);
  return parts.length ? parts.join(' · ') : 'None linked';
}
