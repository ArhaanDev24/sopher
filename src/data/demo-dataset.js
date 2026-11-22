// Demo dataset for "Load demo data". It's a fictional payments company with three software
// projects, chosen to show every path in the engine:
//   - Instant payouts: authorized in June, released Oct 15. Shows work split across all three
//     stages, then amortization in Q4.
//   - Fraud rules engine: authorized Aug 17 and still in development. Shows a preliminary spike,
//     a stage switch mid-quarter, and an estimate-based cost.
//   - Partner analytics portal: no authorization yet, so its feature work goes to review.
//   - A story with no epic, which also goes to review.
// Pure data, so the engine tests can check the numbers the demo will show.

export const DEMO_LABEL = 'sopher-demo';

const log = (date, hours) => ({ started: `${date}T10:00:00.000+0000`, hours });

export const DEMO_DATASET = {
  epics: [
    {
      ref: 'payouts',
      summary: 'Instant payouts',
      authorizedAt: '2026-06-01',
      release: { name: 'Instant Payouts GA', releaseDate: '2026-10-15' },
    },
    { ref: 'fraud', summary: 'Fraud rules engine', authorizedAt: '2026-08-17' },
    { ref: 'partners', summary: 'Partner analytics portal' },
  ],
  issues: [
    { epic: 'payouts', type: 'story', summary: 'Payout API endpoints',
      worklogs: [log('2026-05-20', 6), log('2026-06-10', 16), log('2026-07-08', 20), log('2026-08-12', 18)] },
    { epic: 'payouts', type: 'story', summary: 'Ledger posting for payouts',
      worklogs: [log('2026-07-02', 24), log('2026-08-20', 16), log('2026-09-15', 12)] },
    { epic: 'payouts', type: 'story', summary: 'Payout status webhooks',
      worklogs: [log('2026-08-05', 14), log('2026-09-22', 10)] },
    { epic: 'payouts', type: 'story', summary: 'Admin payout dashboard',
      worklogs: [log('2026-09-01', 18), log('2026-10-02', 8), log('2026-10-28', 4)] },
    { epic: 'payouts', type: 'bug', summary: 'Rounding error on FX payouts', labels: ['bugfix'],
      worklogs: [log('2026-09-10', 6)] },
    { epic: 'payouts', type: 'bug', summary: 'Duplicate payout on retry', labels: ['bugfix'],
      worklogs: [log('2026-10-25', 10)] },
    { epic: 'payouts', type: 'task', summary: 'Upgrade payment provider SDK', labels: ['tech-debt'],
      worklogs: [log('2026-11-05', 8)] },

    { epic: 'fraud', type: 'task', summary: 'Spike: rules engine options', labels: ['spike'],
      worklogs: [log('2026-07-27', 12), log('2026-08-10', 8)] },
    { epic: 'fraud', type: 'story', summary: 'Rule evaluation service',
      worklogs: [log('2026-08-24', 20), log('2026-09-14', 22), log('2026-10-12', 24), log('2026-11-09', 16)] },
    { epic: 'fraud', type: 'story', summary: 'Rule authoring UI',
      worklogs: [log('2026-09-28', 14), log('2026-10-19', 20), log('2026-11-16', 12)] },
    { epic: 'fraud', type: 'story', summary: 'Velocity checks',
      worklogs: [log('2026-10-05', 18), log('2026-11-02', 10)] },
    { epic: 'fraud', type: 'story', summary: 'Fraud case export', originalEstimateHours: 24, worklogs: [] },
    { epic: 'fraud', type: 'bug', summary: 'False positives on refunds', labels: ['bugfix'],
      worklogs: [log('2026-11-12', 6)] },

    { epic: 'partners', type: 'task', summary: 'Discovery interviews with partners', labels: ['discovery'],
      worklogs: [log('2026-09-29', 6)] },
    { epic: 'partners', type: 'story', summary: 'Partner usage reports',
      worklogs: [log('2026-10-20', 10), log('2026-11-10', 8)] },

    { epic: null, type: 'story', summary: 'Merchant onboarding checklist',
      worklogs: [log('2026-09-18', 8), log('2026-10-14', 6)] },
  ],
};

const TYPE_NAME = { story: 'Story', bug: 'Bug', task: 'Task' };

/**
 * The dataset in engine shape, as Jira would return it once seeded. Used by tests, and it
 * documents what loadProject() should read back.
 */
export function demoAsEngineInput({ projectKey = 'DEMO', created = '2026-11-20T10:00:00.000+0000', dataset = DEMO_DATASET } = {}) {
  let n = 0;
  const keyFor = new Map();
  const epics = dataset.epics.map((e) => {
    const key = `${projectKey}-${(n += 1)}`;
    keyFor.set(e.ref, key);
    return {
      key,
      summary: e.summary,
      authorizedAt: e.authorizedAt ?? null,
      releasedAt: e.release?.releaseDate ?? null,
    };
  });
  const issues = dataset.issues.map((i) => ({
    key: `${projectKey}-${(n += 1)}`,
    summary: i.summary,
    issueType: TYPE_NAME[i.type],
    epicKey: i.epic ? keyFor.get(i.epic) : null,
    labels: [DEMO_LABEL, ...(i.labels ?? [])],
    created,
    resolved: null,
    assigneeAccountId: null,
    originalEstimateSeconds: (i.originalEstimateHours ?? 0) * 3600,
    worklogs: i.worklogs.map((w) => ({ accountId: 'demo-user', started: w.started, seconds: w.hours * 3600 })),
  }));
  return { epics, issues };
}

// ---- Keeping the demo current ------------------------------------------------------------
// The dataset is written for 2026-Q3/Q4. When seeding later (judging runs into 2027), every date
// is shifted forward by whole quarters, as far as possible without any time log landing in the
// future. Whole quarters keep every figure identical; only the quarter labels change.


function shiftDate(value, months) {
  const [datePart, timePart] = String(value).split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1 + months, d));
  const day = shifted.toISOString().slice(0, 10);
  return timePart ? `${day}T${timePart}` : day;
}

function latestDate(dataset) {
  return dataset.issues
    .flatMap((i) => i.worklogs.map((w) => w.started.slice(0, 10)))
    .sort()
    .at(-1);
}

export function shiftDataset(dataset, months) {
  if (months === 0) return dataset;
  return {
    epics: dataset.epics.map((e) => ({
      ...e,
      authorizedAt: e.authorizedAt && shiftDate(e.authorizedAt, months),
      release: e.release && { ...e.release, releaseDate: shiftDate(e.release.releaseDate, months) },
    })),
    issues: dataset.issues.map((i) => ({
      ...i,
      worklogs: i.worklogs.map((w) => ({ ...w, started: shiftDate(w.started, months) })),
    })),
  };
}

/** The demo dataset moved forward by whole quarters so its newest work sits in or near `now`. */
export function currentDemoDataset(now = new Date()) {
  const quartersAhead = Math.floor(
    ((now.getUTCFullYear() * 12 + now.getUTCMonth()) - (2026 * 12 + 9)) / 3,
  );
  const today = now.toISOString().slice(0, 10);
  for (let q = Math.max(0, quartersAhead); q >= 0; q -= 1) {
    const shifted = shiftDataset(DEMO_DATASET, q * 3);
    if (latestDate(shifted) <= today || q === 0) return { dataset: shifted, shiftMonths: q * 3 };
  }
  return { dataset: DEMO_DATASET, shiftMonths: 0 };
}

