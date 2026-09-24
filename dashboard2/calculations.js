// ============================================================
// ROR SALES DASHBOARD 2 — calculations
// ------------------------------------------------------------
// Pure functions only (no DOM, no React) so they can be unit
// tested from plain Node — see dashboard2/test/calculations.test.js.
//
// Ground rules encoded here (see build brief §5–§7):
//  - AOV is always revenue / orders, summed first — never an
//    average of per-store or per-month AOVs.
//  - A missing period is never silently treated as zero.
//  - A future period is "not occurred", not zero, not "no data".
//  - A percentage change is never computed against a zero or
//    missing denominator — those return null with a reason.
//  - A comparison against a month still in progress is labelled
//    incomplete rather than silently compared to a full period.
// ============================================================

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./data-model.js'));
  } else {
    root.RorCalc = factory(root.RorModel);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (RorModel) {

const { addMonths, compareMonthKeys, fyInfoForDate, fyInfoForMonth, quarterOfMonth } = RorModel;

function monthKeyFromDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

function periodsInRange(startPeriod, endPeriod) {
  const out = [];
  let p = startPeriod;
  while (compareMonthKeys(p, endPeriod) <= 0) { out.push(p); p = addMonths(p, 1); }
  return out;
}

// ── date-range presets ──────────────────────────────────────
const DAILY_UNSUPPORTED_REASON =
  "Daily/short-window figures aren't available yet — the connected source data (spreadsheet import + demo fixture) only holds monthly totals. " +
  "This will switch on once StockHub's daily sales-history export is connected (Phase 2).";

const DAILY_PRESETS = new Set(['today', 'yesterday', 'last7', 'last30']);

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisYear', label: 'This year' },
  { key: 'lastYear', label: 'Last year' },
  { key: 'currentFY', label: 'Current financial year' },
  { key: 'previousFY', label: 'Previous financial year' },
  { key: 'last12Months', label: 'Last 12 months' },
  { key: 'custom', label: 'Custom range' },
];

function resolveDateRange(presetKey, opts) {
  opts = opts || {};
  const now = opts.nowDate || new Date();
  const nowPeriod = monthKeyFromDate(now);

  if (DAILY_PRESETS.has(presetKey)) {
    return { unsupported: true, reason: DAILY_UNSUPPORTED_REASON, presetKey };
  }

  switch (presetKey) {
    case 'thisMonth':
      return { startPeriod: nowPeriod, endPeriod: nowPeriod, label: 'This month', presetKey };
    case 'lastMonth': {
      const p = addMonths(nowPeriod, -1);
      return { startPeriod: p, endPeriod: p, label: 'Last month', presetKey };
    }
    case 'thisYear': {
      const y = now.getFullYear();
      return { startPeriod: `${y}-01`, endPeriod: nowPeriod, label: `This year (Jan–date, ${y})`, presetKey };
    }
    case 'lastYear': {
      const y = now.getFullYear() - 1;
      return { startPeriod: `${y}-01`, endPeriod: `${y}-12`, label: `Last year (${y})`, presetKey };
    }
    case 'currentFY': {
      const fy = fyInfoForDate(now);
      return { startPeriod: fy.startPeriod, endPeriod: nowPeriod, label: `${fy.fyKey} (to date)`, presetKey };
    }
    case 'previousFY': {
      const fy = fyInfoForDate(now);
      const startPeriod = addMonths(fy.startPeriod, -12);
      const endPeriod = addMonths(fy.endPeriod, -12);
      const prevFy = fyInfoForMonth(startPeriod);
      return { startPeriod, endPeriod, label: prevFy.fyKey, presetKey };
    }
    case 'last12Months': {
      const startPeriod = addMonths(nowPeriod, -11);
      return { startPeriod, endPeriod: nowPeriod, label: 'Last 12 months', presetKey };
    }
    case 'custom': {
      if (!opts.customStart || !opts.customEnd) {
        return { unsupported: true, reason: 'Pick a start and end month.', presetKey };
      }
      if (compareMonthKeys(opts.customStart, opts.customEnd) > 0) {
        return { unsupported: true, reason: 'Start month must be before end month.', presetKey };
      }
      return { startPeriod: opts.customStart, endPeriod: opts.customEnd, label: 'Custom range', presetKey };
    }
    default:
      return { unsupported: true, reason: 'Unknown date range.', presetKey };
  }
}

// ── aggregation ──────────────────────────────────────────────
// Sums revenue and orders first, THEN divides for AOV — never
// averages per-record or per-channel AOVs.
function aggregate(records, opts) {
  const { channels, startPeriod, endPeriod } = opts;
  const nowPeriod = opts.nowPeriod || monthKeyFromDate(new Date());
  const allPeriods = periodsInRange(startPeriod, endPeriod);
  const occurredPeriods = allPeriods.filter((p) => compareMonthKeys(p, nowPeriod) <= 0);

  if (occurredPeriods.length === 0) {
    return {
      revenue: null, orders: null, aov: null,
      status: 'not-occurred', recordCount: 0, expectedCount: allPeriods.length * channels.length,
      channels, startPeriod, endPeriod,
      note: 'This period is in the future.',
    };
  }

  const matches = records.filter((r) =>
    channels.includes(r.channel) &&
    compareMonthKeys(r.period, startPeriod) >= 0 &&
    compareMonthKeys(r.period, endPeriod) <= 0
  );

  const expectedCount = occurredPeriods.length * channels.length;
  const foundCount = matches.length;
  const revenue = matches.reduce((s, r) => s + r.revenue, 0);
  const orders = matches.reduce((s, r) => s + r.orders, 0);
  const hasPartial = matches.some((r) => r.completeness === 'partial');

  let status;
  if (foundCount === 0) status = 'no-data';
  else if (hasPartial) status = 'partial';
  else if (foundCount < expectedCount) status = 'incomplete-data';
  else status = 'complete';

  let note = null;
  if (status === 'no-data') note = 'No data recorded for this period/channel selection.';
  else if (status === 'incomplete-data') note = `Data missing for ${expectedCount - foundCount} of ${expectedCount} channel-months in this range.`;
  else if (status === 'partial') note = 'Period still in progress — figures are month-to-date.';

  return {
    revenue: foundCount ? revenue : null,
    orders: foundCount ? orders : null,
    aov: (foundCount && orders > 0) ? revenue / orders : null,
    status, recordCount: foundCount, expectedCount,
    channels, startPeriod, endPeriod, note,
  };
}

// ── comparisons (MoM / YoY / any two aggregates) ────────────
function compareAggregates(currentAgg, previousAgg, metric) {
  const cur = currentAgg ? currentAgg[metric] : null;
  const prev = previousAgg ? previousAgg[metric] : null;

  if (!currentAgg || currentAgg.status === 'not-occurred') {
    return { status: 'not-occurred', current: null, previous: prev, absoluteChange: null, percentChange: null,
      note: 'This period has not happened yet.' };
  }
  if (currentAgg.status === 'no-data') {
    return { status: 'no-comparison-data', current: null, previous: prev, absoluteChange: null, percentChange: null,
      note: 'No data recorded for the current period.' };
  }
  if (!previousAgg || previousAgg.status === 'no-data' || previousAgg.status === 'not-occurred') {
    return { status: 'no-comparison-data', current: cur, previous: null, absoluteChange: null, percentChange: null,
      note: 'No comparable data available for the prior period.' };
  }

  const absoluteChange = (cur != null && prev != null) ? cur - prev : null;
  let status = 'ok';
  let percentChange = null;
  let note = null;

  if (prev === 0) {
    status = 'zero-denominator';
    note = 'Prior period is zero — percentage change is not meaningful.';
  } else if (prev != null && cur != null) {
    percentChange = (cur / prev - 1) * 100;
  }

  if (currentAgg.status === 'partial') {
    status = status === 'ok' ? 'incomplete-current' : status;
    note = (note ? note + ' ' : '') + 'Current period is still in progress (month-to-date) — not a like-for-like comparison yet.';
  }

  return { status, current: cur, previous: prev, absoluteChange, percentChange, note };
}

// ── granularity buckets (monthly / quarterly / FY / calendar-year) ──
const BUCKET_MONTHS = { monthly: 1, quarterly: 3, 'financial-year': 12, 'calendar-year': 12 };

function alignBucketStart(granularity, periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  if (granularity === 'monthly') return periodKey;
  if (granularity === 'quarterly') {
    const q = quarterOfMonth(m);
    return `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}`;
  }
  if (granularity === 'calendar-year') return `${y}-01`;
  if (granularity === 'financial-year') {
    const fy = fyInfoForMonth(periodKey);
    return fy.startPeriod;
  }
  throw new Error('Unknown granularity: ' + granularity);
}

function makeBucket(granularity, alignedStartPeriod) {
  const len = BUCKET_MONTHS[granularity];
  const endPeriod = addMonths(alignedStartPeriod, len - 1);
  const [y, m] = alignedStartPeriod.split('-').map(Number);
  let label, key;
  if (granularity === 'monthly') {
    label = RorModel.monthLabel(alignedStartPeriod);
    key = alignedStartPeriod;
  } else if (granularity === 'quarterly') {
    const q = quarterOfMonth(m);
    label = `Q${q} ${y}`;
    key = `${y}-Q${q}`;
  } else if (granularity === 'calendar-year') {
    label = String(y);
    key = String(y);
  } else if (granularity === 'financial-year') {
    const fy = fyInfoForMonth(alignedStartPeriod);
    label = fy.fyKey;
    key = fy.fyKey;
  }
  return { key, label, startPeriod: alignedStartPeriod, endPeriod, granularity };
}

function bucketsForGranularity(granularity, fromPeriod, toPeriod) {
  const buckets = [];
  let start = alignBucketStart(granularity, fromPeriod);
  const len = BUCKET_MONTHS[granularity];
  while (compareMonthKeys(start, toPeriod) <= 0) {
    buckets.push(makeBucket(granularity, start));
    start = addMonths(start, len);
  }
  return buckets;
}

function previousBucket(bucket) {
  const len = BUCKET_MONTHS[bucket.granularity];
  return makeBucket(bucket.granularity, addMonths(bucket.startPeriod, -len));
}

function yearEarlierBucket(bucket) {
  return makeBucket(bucket.granularity, addMonths(bucket.startPeriod, -12));
}

// ── comparison table rows ───────────────────────────────────
// One row per bucket: current aggregate + MoM-analog (previous
// bucket) + YoY-analog (same bucket one year earlier). For
// financial-year / calendar-year granularity these two collapse
// to the same thing — callers should only show one column then.
function buildComparisonTable(records, opts) {
  const { channels, granularity, fromPeriod, toPeriod, metric, nowPeriod } = opts;
  const buckets = bucketsForGranularity(granularity, fromPeriod, toPeriod);

  const rows = buckets.map((bucket) => {
    const current = aggregate(records, { channels, startPeriod: bucket.startPeriod, endPeriod: bucket.endPeriod, nowPeriod });
    const prevB = previousBucket(bucket);
    const yoyB = yearEarlierBucket(bucket);
    const previous = aggregate(records, { channels, startPeriod: prevB.startPeriod, endPeriod: prevB.endPeriod, nowPeriod });
    const yearAgo = aggregate(records, { channels, startPeriod: yoyB.startPeriod, endPeriod: yoyB.endPeriod, nowPeriod });
    return {
      bucket,
      current,
      mom: compareAggregates(current, previous, metric),
      yoy: compareAggregates(current, yearAgo, metric),
    };
  });

  // Totals row — summed from underlying records over the whole
  // range, never by summing/averaging the per-bucket AOV figures.
  const totalAgg = aggregate(records, { channels, startPeriod: fromPeriod, endPeriod: toPeriod, nowPeriod });

  return { rows, totals: totalAgg, metric, granularity };
}

// ── arbitrary-range shifts (for KPI-card comparisons, where the
// selected range isn't necessarily a single aligned bucket) ────
function rangeLengthMonths(startPeriod, endPeriod) { return periodsInRange(startPeriod, endPeriod).length; }

function previousEquivalentRange(startPeriod, endPeriod) {
  const len = rangeLengthMonths(startPeriod, endPeriod);
  const prevEnd = addMonths(startPeriod, -1);
  const prevStart = addMonths(prevEnd, -(len - 1));
  return { startPeriod: prevStart, endPeriod: prevEnd };
}

function yearEarlierRange(startPeriod, endPeriod) {
  return { startPeriod: addMonths(startPeriod, -12), endPeriod: addMonths(endPeriod, -12) };
}

// ── channel contribution ────────────────────────────────────
function channelContribution(records, opts) {
  const { channels, startPeriod, endPeriod, nowPeriod } = opts;
  const perChannel = channels.map((channel) => {
    const agg = aggregate(records, { channels: [channel], startPeriod, endPeriod, nowPeriod });
    return { channel, ...agg };
  });
  const totalRevenue = perChannel.reduce((s, c) => s + (c.revenue || 0), 0);
  const withPct = perChannel.map((c) => ({
    ...c,
    pctOfRevenue: (c.revenue != null && totalRevenue > 0) ? c.revenue / totalRevenue : null,
  }));
  const totals = aggregate(records, { channels, startPeriod, endPeriod, nowPeriod });
  return { channels: withPct, totals };
}

// ── chart series ─────────────────────────────────────────────
// seriesMode: 'combined' (one "All Stores" series) or 'byChannel'
// (one series per channel). comparison: 'none' | 'previous-period' | 'previous-year'.
function buildSeries(records, opts) {
  const { channels, granularity, fromPeriod, toPeriod, metric, seriesMode, comparison, nowPeriod } = opts;
  const buckets = bucketsForGranularity(granularity, fromPeriod, toPeriod);
  const seriesChannelGroups = seriesMode === 'byChannel' ? channels.map((c) => [c]) : [channels];

  const series = seriesChannelGroups.map((chGroup) => {
    const points = buckets.map((bucket) => {
      const agg = aggregate(records, { channels: chGroup, startPeriod: bucket.startPeriod, endPeriod: bucket.endPeriod, nowPeriod });
      return { bucket, value: agg[metric], status: agg.status, note: agg.note };
    });
    return { key: chGroup.length === 1 ? chGroup[0] : 'all', channels: chGroup, points };
  });

  let comparisonSeries = null;
  if (comparison && comparison !== 'none') {
    comparisonSeries = seriesChannelGroups.map((chGroup) => {
      const points = buckets.map((bucket) => {
        const cmpB = comparison === 'previous-year' ? yearEarlierBucket(bucket) : previousBucket(bucket);
        const agg = aggregate(records, { channels: chGroup, startPeriod: cmpB.startPeriod, endPeriod: cmpB.endPeriod, nowPeriod });
        return { bucket: cmpB, value: agg[metric], status: agg.status, note: agg.note };
      });
      return { key: (chGroup.length === 1 ? chGroup[0] : 'all') + ':compare', channels: chGroup, points };
    });
  }

  return { buckets, series, comparisonSeries, metric, granularity };
}

return {
  monthKeyFromDate, periodsInRange,
  DATE_PRESETS, DAILY_UNSUPPORTED_REASON, resolveDateRange,
  aggregate, compareAggregates,
  bucketsForGranularity, previousBucket, yearEarlierBucket, alignBucketStart, makeBucket,
  previousEquivalentRange, yearEarlierRange, rangeLengthMonths,
  buildComparisonTable, channelContribution, buildSeries,
};

});
