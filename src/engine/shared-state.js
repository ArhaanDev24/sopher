// Shared state across Sopher's installations. Pure functions only.
//
// Sopher's settings, overrides, quarter closes and nudges live in app storage, and Forge keeps a
// separate store for each installation. When Sopher is installed in both Jira and Confluence on a
// site, the Confluence installation (the macro, and Rovo or MCP calls served from it) can't see
// what controllers did in Jira. So the Jira side publishes a copy of each project's state as a
// Jira project property after every change. Any installation reads it through Jira's API, with the
// user's own Jira permissions. The copy holds no account IDs.

import { mergeSettings } from './classify.js';

export const STATE_PROPERTY = 'sopher-state';
const VERSION = 1;

/** "PAY-42" -> "PAY" */
export const projectOfIssue = (issueKey) => {
  const key = String(issueKey);
  return key.slice(0, key.lastIndexOf('-'));
};

const withoutAccountId = (record) => {
  const { byAccountId, ...rest } = record ?? {}; // eslint-disable-line no-unused-vars
  return rest;
};

/**
 * The state one project needs, ready to store as a Jira project property.
 * @param {string} projectKey
 * @param {{ settings: object, overrides?: object, closes?: object, nudges?: object }} state
 * @param {string} at ISO timestamp
 */
export function projectState(projectKey, { settings, overrides = {}, closes = {}, nudges = {} }, at) {
  const ofProject = (map, test) => Object.fromEntries(Object.entries(map).filter(([k]) => test(k)));
  const isIssueOfProject = (k) => projectOfIssue(k) === projectKey;
  // Per-person pay rates are never copied: a project property is readable by everyone who can
  // browse the project. Readers learn only how many were left out.
  const { ratesByAccountId = {}, ...sharedSettings } = settings ?? {};
  return {
    version: VERSION,
    projectKey,
    updatedAt: at,
    settings: sharedSettings,
    personalRatesOmitted: Object.keys(ratesByAccountId).length,
    overrides: Object.fromEntries(Object.entries(ofProject(overrides, isIssueOfProject)).map(([k, v]) => [k, withoutAccountId(v)])),
    closes: Object.fromEntries(Object.entries(ofProject(closes, (k) => k.startsWith(`${projectKey}:`))).map(([k, v]) => [k, withoutAccountId(v)])),
    nudges: ofProject(nudges, isIssueOfProject),
  };
}

/** Reads a stored project state back into engine shape, or null if missing or unrecognized. */
export function stateFromProperty(value) {
  if (!value || value.version !== VERSION) return null;
  return {
    settings: mergeSettings(value.settings ?? {}),
    overrides: value.overrides ?? {},
    closes: value.closes ?? {},
    nudges: value.nudges ?? {},
    updatedAt: value.updatedAt ?? null,
    personalRatesOmitted: value.personalRatesOmitted ?? 0,
  };
}
