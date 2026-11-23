// "Ask in Jira": turns a review-queue item into a targeted question, posted as a Jira comment
// where the person who can fix it will see it. Finance stops chasing engineers over chat or a
// spreadsheet survey, and the answer lands in Jira, where Sopher picks it up.
// Pure functions only.

const money = (n, currency) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n ?? 0);

/**
 * @param {object} item review-queue entry from buildSchedule
 * @param {{ epicSummary?: string, currency?: string, quarter?: string }} ctx
 * @returns {{ targetKey: string, kind: string, message: string }}
 */
export function nudgeFor(item, { epicSummary = null, currency = 'USD', quarter = '' } = {}) {
  const cost = money((item.quarterCapex ?? 0) + (item.quarterOpex ?? 0), currency);
  const when = quarter ? ` in ${quarter}` : '';

  if (!item.epicKey) {
    return {
      targetKey: item.key,
      kind: 'no-epic',
      message: `Finance check from Sopher: this work item isn't linked to an epic, so ${cost} of work logged${when} `
        + 'can\'t be classified for software capitalization. Could you set its parent epic? '
        + 'If it\'s support or maintenance, adding the label "maintenance" works too. Thanks!',
    };
  }

  if (item.reasons?.some((r) => /no project authorization date/i.test(r))) {
    return {
      targetKey: item.epicKey,
      kind: 'not-authorized',
      message: `Finance check from Sopher: work is being logged on this epic${epicSummary ? ` ("${epicSummary}")` : ''}, `
        + 'but it has no project authorization date, so all of its feature work is being expensed. '
        + 'If the project was approved (for example a signed-off spec or funding decision), please reply with the approval date, '
        + 'or set it in the Capitalization panel on this epic.',
    };
  }

  return {
    targetKey: item.key,
    kind: 'unclear-type',
    message: `Finance check from Sopher: is this work new functionality or maintenance? Its issue type "${item.issueType}" `
      + `isn't one Sopher classifies automatically, so ${cost}${when} needs a controller decision. A one-line reply is enough.`,
  };
}

/** Atlassian Document Format body for a plain-text Jira comment. */
export function commentBody(text) {
  return { body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } };
}
