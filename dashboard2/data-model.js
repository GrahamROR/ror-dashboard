// ROR Sales Dashboard — canonical commercial reporting model.
// Records are daily, source-level aggregates exported from production D1.
// No customer, SKU mapping, inventory or supplier-purchase fields belong here.
(function (root) {

const ACTIVE_CHANNELS = ['shopify', 'noths', 'etsy'];
const ALL_CHANNELS = ACTIVE_CHANNELS.slice();

// Display contract for existing exports. No accounting cutover or inferred VAT.
const METRICS = {
  revenue: { label: 'Imported gross line sales', basis: 'Sum of sales_history_items.gross_revenue; VAT, discounts and refunds are not reconciled.', source: 'D1 sales_history_items', reconciliation_status: 'unreconciled' },
  orders: { label: 'Imported orders', basis: 'Distinct external order IDs per source/day; eligibility and refund policies pending reconciliation.', source: 'D1 sales_history_items', reconciliation_status: 'unreconciled' },
  units: { label: 'Purchased units (imported)', basis: 'Sum of imported quantity; not verified net of returns.', source: 'D1 sales_history_items', reconciliation_status: 'unreconciled' },
  aov: { label: 'Imported gross line AOV', basis: 'Imported gross line sales ÷ imported orders; not net merchandise AOV.', source: 'D1 sales_history_items', reconciliation_status: 'unreconciled' },
  shopifyTotalSales: { label: 'Shopify total sales', basis: 'Shopify total_sales, including shipping and taxes. Historical snapshots pending reconciliation.', source: 'Shopify Analytics', reconciliation_status: 'unreconciled' },
  shopifyAov: { label: 'Shopify-reported AOV', basis: 'Shopify average_order_value; distinct from total sales ÷ orders and net merchandise AOV.', source: 'Shopify Analytics', reconciliation_status: 'unreconciled' },
  attributedValue: { label: 'Platform-attributed conversion value', basis: 'Platform event values; tax basis unverified. Attribution overlaps across platforms and does not sum to actual sales.', source: 'Meta / Google Ads / Klaviyo', reconciliation_status: 'not_applicable' },
  estimatedProfit: { label: 'Estimated gross profit', basis: 'Costed-SKU margin extrapolated to net sales; incomplete cost coverage, excludes operating expenses.', source: 'Shopify Analytics costed SKUs', reconciliation_status: 'estimated' },
};

const CHANNEL_META = {
  shopify: {
    label: 'Shopify', short: 'Shopify', color: 'var(--amb)', bg: 'var(--amb-bg)', active: true,
    revenueDefinition: 'Gross line revenue from imported Shopify sales, grouped by order date.',
  },
  noths: {
    label: 'Not On The High Street', short: 'NOTHS', color: 'var(--blu)', bg: 'var(--blu-bg)', active: true,
    revenueDefinition: 'Gross line revenue from imported NOTHS sales, grouped by placed date.',
  },
  etsy: {
    label: 'Etsy', short: 'Etsy', color: 'var(--pur)', bg: 'var(--pur-bg)', active: true,
    revenueDefinition: 'Gross line revenue from imported Etsy sales, grouped by order date.',
  },
};

const GRANULARITIES = [
  { key: 'daily', label: 'Daily', supported: true },
  { key: 'weekly', label: 'Weekly', supported: true },
  { key: 'monthly', label: 'Monthly', supported: true },
  { key: 'quarterly', label: 'Quarterly', supported: true },
  { key: 'financial-year', label: 'Financial year', supported: true },
  { key: 'calendar-year', label: 'Calendar year', supported: true },
];

function fyInfoForMonth(periodKey) {
  const [y, m] = periodKey.slice(0, 7).split('-').map(Number);
  const startYear = m >= 8 ? y : y - 1;
  const endYear = startYear + 1;
  return {
    fyKey: 'FY' + String(endYear).slice(-2), label: `Aug ${startYear} – Jul ${endYear}`,
    startYear, endYear, startPeriod: `${startYear}-08`, endPeriod: `${endYear}-07`,
  };
}

function fyInfoForDate(date) { return fyInfoForMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`); }
function quarterOfMonth(m) { return Math.floor((m - 1) / 3) + 1; }
function periodKeyToDate(periodKey) { const [y, m] = periodKey.split('-').map(Number); return new Date(y, m - 1, 1); }
function monthLabel(periodKey) { return periodKeyToDate(periodKey).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }); }
function addMonths(periodKey, n) { const d = periodKeyToDate(periodKey); d.setMonth(d.getMonth() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function compareMonthKeys(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

// Presentation only: source keys, date filtering and native date-input values stay ISO.
function formatDate(value) {
  if (value == null) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return value;
    return value.split('-').reverse().join('-');
  }
  const date = Object.prototype.toString.call(value) === '[object Date]' ? new Date(value.getTime()) : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date).replace(/\//g, '-');
}
function formatDateTime(value) {
  if (value == null || /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return formatDate(value) + ' at ' + new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
function formatDateText(text) {
  return typeof text !== 'string' ? text : text.replace(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?\b/g,
    value => value.includes('T') ? formatDateTime(value) : formatDate(value));
}

const RorModel = {
  formatDate, formatDateTime, formatDateText,
  ACTIVE_CHANNELS, LEGACY_CHANNELS: [], ALL_CHANNELS, CHANNEL_META, GRANULARITIES, METRICS,
  fyInfoForMonth, fyInfoForDate, quarterOfMonth, periodKeyToDate, monthLabel, addMonths, compareMonthKeys,
};

if (typeof module !== 'undefined' && module.exports) module.exports = RorModel;
else root.RorModel = RorModel;

})(typeof window !== 'undefined' ? window : globalThis);
