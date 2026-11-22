// App storage (Forge KVS): settings and controller overrides.

import { kvs } from '@forge/kvs';
import { mergeSettings } from '../engine/classify.js';

const SETTINGS_KEY = 'settings';
const OVERRIDES_KEY = 'overrides';

export async function getSettings() {
  return mergeSettings((await kvs.get(SETTINGS_KEY)) ?? {});
}

export async function saveSettings(patch) {
  const next = mergeSettings({ ...(await kvs.get(SETTINGS_KEY)), ...patch });
  if (!(next.defaultHourlyRate > 0)) throw new Error('Default hourly rate must be greater than 0.');
  if (!Number.isInteger(next.usefulLifeMonths) || next.usefulLifeMonths < 1) {
    throw new Error('Useful life must be a whole number of months, 1 or more.');
  }
  await kvs.set(SETTINGS_KEY, next);
  return next;
}

/** Map of issueKey -> { treatment, reason, byAccountId, byName, at } */
export async function getOverrides() {
  return (await kvs.get(OVERRIDES_KEY)) ?? {};
}

export async function setOverride(issueKey, override) {
  const all = await getOverrides();
  if (override === null) {
    delete all[issueKey];
  } else {
    if (!['capex', 'opex'].includes(override.treatment)) throw new Error('Treatment must be capex or opex.');
    if (!override.reason?.trim()) throw new Error('A reason is required for an override (it becomes audit evidence).');
    all[issueKey] = { ...override, reason: override.reason.trim(), at: new Date().toISOString() };
  }
  await kvs.set(OVERRIDES_KEY, all);
  return all[issueKey] ?? null;
}

/** Replaces all overrides (used by the daily personal-data job). */
export async function saveOverrides(all) {
  await kvs.set(OVERRIDES_KEY, all);
}
