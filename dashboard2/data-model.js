// ============================================================
// ROR SALES DASHBOARD — canonical data model & shared constants
// ------------------------------------------------------------
// This is the "contract" between whatever produces sales records
// (today: dashboard2/demo-data.json, later: a StockHub v2 reporting
// export) and the dashboard UI. Nothing in ror-sales-app.js or
// charts.js should reach past this shape into a source-specific
// field — that's what keeps the StockHub swap a data-adapter change
// only, not a UI rewrite.
//
// Canonical record shape (one per channel per reporting period):
// {
//   period:       'YYYY-MM'                 // monthly is the only grain the
//                                            // current sources support
//   channel:      'shopify'|'noths'|'etsy'|'silkfred'|'asos'
//   revenue:      number                    // in `currency`, per that channel's
//                                            // revenueDefinition below
//   orders:       number
//   currency:     'GBP'
//   source:       'demo-fixture'|'spreadsheet-import'|'stockhub-api'
//   importedAt:   ISO date string
//   completeness: 'complete'|'partial'|'future'|'unavailable'
// }
// ============================================================

(function (root) {

const ACTIVE_CHANNELS = ['shopify', 'noths', 'etsy'];
const LEGACY_CHANNELS  = ['silkfred', 'asos'];
const ALL_CHANNELS     = ACTIVE_CHANNELS.concat(LEGACY_CHANNELS);

// Revenue is NOT the same measurement across channels — see brief §13.
// NOTHS in particular reports on payment/payout date (2-3 weeks in
// arrears), not order date, per the source workbook's own sheet header.
// Every place that shows a revenue figure should be able to point back
// to this so nobody quietly sums three different things together.
const CHANNEL_META = {
  shopify: {
    label: 'Shopify',
    short: 'Shopify',
    color: 'var(--amb)',
    bg: 'var(--amb-bg)',
    active: true,
    revenueDefinition: 'Gross order revenue (order date), before refunds/discounts adjustments applied by Shopify.',
  },
  noths: {
    label: 'Not On The High Street',
    short: 'NOTHS',
    color: 'var(--blu)',
    bg: 'var(--blu-bg)',
    active: true,
    revenueDefinition: 'Payout revenue — settled 2–3 weeks in arrears. Date reflects payment date, not order date.',
  },
  etsy: {
    label: 'Etsy',
    short: 'Etsy',
    color: 'var(--pur)',
    bg: 'var(--pur-bg)',
    active: true,
    revenueDefinition: 'Order receipts (order date), before Etsy fees.',
  },
  silkfred: {
    label: 'SilkFred (closed)',
    short: 'SilkFred',
    color: 'var(--t3)',
    bg: 'rgba(255,255,255,0.05)',
    active: false,
    revenueDefinition: 'Order revenue. Channel closed — historical reference only.',
  },
  asos: {
    label: 'ASOS (closed)',
    short: 'ASOS',
    color: 'var(--t3)',
    bg: 'rgba(255,255,255,0.05)',
    active: false,
    revenueDefinition: 'Order revenue. Channel closed — historical reference only.',
  },
};

const GRANULARITIES = [
  { key: 'monthly',        label: 'Monthly',        supported: true  },
  { key: 'quarterly',      label: 'Quarterly',      supported: true  },
  { key: 'financial-year', label: 'Financial year', supported: true  },
  { key: 'calendar-year',  label: 'Calendar year',  supported: true  },
  { key: 'weekly',         label: 'Weekly',         supported: false },
  { key: 'daily',          label: 'Daily',          supported: false },
];

const UNSUPPORTED_GRANULARITY_NOTE =
  'Not available yet — the current source data (spreadsheet + demo fixture) only holds monthly totals. ' +
  'Daily/weekly views will switch on once StockHub\'s daily sales-history export is connected.';

// ROR's financial year runs Aug -> Jul, named after the year it ends in
// (matches scripts/fetch-data.js's computeFiscalYear so both dashboards
// agree on what "FY27" means).
function fyInfoForMonth(periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  const startYear = m >= 8 ? y : y - 1;
  const endYear = startYear + 1;
  return {
    fyKey: 'FY' + String(endYear).slice(-2),
    label: `Aug ${startYear} – Jul ${endYear}`,
    startYear, endYear,
    startPeriod: `${startYear}-08`,
    endPeriod: `${endYear}-07`,
  };
}

function fyInfoForDate(date) {
  return fyInfoForMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
}

function quarterOfMonth(m) { return Math.floor((m - 1) / 3) + 1; }

function periodKeyToDate(periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function monthLabel(periodKey) {
  const d = periodKeyToDate(periodKey);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function addMonths(periodKey, n) {
  const d = periodKeyToDate(periodKey);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function compareMonthKeys(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

const RorModel = {
  ACTIVE_CHANNELS, LEGACY_CHANNELS, ALL_CHANNELS, CHANNEL_META,
  GRANULARITIES, UNSUPPORTED_GRANULARITY_NOTE,
  fyInfoForMonth, fyInfoForDate, quarterOfMonth,
  periodKeyToDate, monthLabel, addMonths, compareMonthKeys,
};

if (typeof module !== 'undefined' && module.exports) module.exports = RorModel;
else root.RorModel = RorModel;

})(typeof window !== 'undefined' ? window : globalThis);
