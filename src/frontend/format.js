export const money = (n, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n ?? 0);

export const pct = (n) => `${Math.round((n ?? 0) * 100)}%`;

export const TREATMENT_LOZENGE = {
  capex: { appearance: 'success', label: 'Capitalized' },
  opex: { appearance: 'default', label: 'Expensed' },
  mixed: { appearance: 'inprogress', label: 'Split' },
};

export const CONFIDENCE_LOZENGE = {
  high: { appearance: 'success', label: 'High confidence' },
  medium: { appearance: 'moved', label: 'Medium confidence' },
  low: { appearance: 'removed', label: 'Low confidence' },
};

export const STAGE_LABEL = {
  preliminary: 'Preliminary',
  development: 'Development',
  'post-implementation': 'Post-implementation',
};
