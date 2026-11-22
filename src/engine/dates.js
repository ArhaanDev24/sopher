// Date helpers. Everything is computed in UTC so results don't depend on where code runs.

/** Parses Jira/ISO dates, including Jira's "+0000" offset form. Returns null for empty input. */
export function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  const normalized = String(value).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
  return d;
}

/** "2026-10-03" for a date-like value, or null. */
export function toDay(value) {
  const d = parseDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

/** "2026-Q4" for a date-like value. */
export function quarterOf(value) {
  const d = parseDate(value);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export function currentQuarter(now = new Date()) {
  return quarterOf(now);
}

/** Half-open range [start, end) for "YYYY-QN". */
export function parseQuarter(quarter) {
  const m = /^(\d{4})-Q([1-4])$/.exec(String(quarter ?? '').trim().toUpperCase());
  if (!m) throw new Error(`Invalid quarter "${quarter}". Use the form 2026-Q3.`);
  const year = Number(m[1]);
  const q = Number(m[2]);
  return {
    start: new Date(Date.UTC(year, (q - 1) * 3, 1)),
    end: new Date(Date.UTC(year, q * 3, 1)),
  };
}

/** The n quarters ending with `quarter`, newest first. */
export function recentQuarters(n, quarter = currentQuarter()) {
  const { start } = parseQuarter(quarter);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(quarterOf(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - i * 3, 1))));
  }
  return out;
}

/** Months since year 0, so months can be compared and subtracted. */
export function monthIndex(value) {
  const d = parseDate(value);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
