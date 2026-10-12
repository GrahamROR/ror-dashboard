// Pure commercial reporting calculations over daily D1 sales aggregates.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./data-model.js'));
  else root.RorCalc = factory(root.RorModel);
})(typeof window !== 'undefined' ? window : globalThis, function (RorModel) {

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');
function dateKeyFromDate(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function monthKeyFromDate(d) { return dateKeyFromDate(d).slice(0, 7); }
function parseDate(key) {
  const parts = String(key).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(parts[0], (parts[1] || 1) - 1, parts[2] || 1));
}
function dateKey(d) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function addDays(key, n) { const d = parseDate(key); d.setUTCDate(d.getUTCDate() + n); return dateKey(d); }
function addMonthsDate(key, n) {
  const d = parseDate(key); const wantedDay = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(wantedDay, last)); return dateKey(d);
}
function endOfMonth(key) { const d = parseDate(key); return dateKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); }
function startOfMonth(key) { return key.slice(0, 7) + '-01'; }
function minKey(a, b) { return a < b ? a : b; }
function maxKey(a, b) { return a > b ? a : b; }
function normalizeStart(key) { return String(key).length === 7 ? key + '-01' : String(key).slice(0, 10); }
function normalizeEnd(key) { return String(key).length === 7 ? endOfMonth(key + '-01') : String(key).slice(0, 10); }

const REPORT_DATE_PRESETS = [
  { key: 'currentFY', label: 'Current financial year' },
  { key: 'previousFY', label: 'Previous financial year' },
  { key: 'last12Months', label: 'Last 12 months (rolling calendar months)' },
  { key: 'year2024', label: 'Calendar year 2024' },
  { key: 'year2025', label: 'Calendar year 2025' },
  { key: 'year2026YTD', label: 'Calendar year 2026 year to date' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'custom', label: 'Custom range' },
];
const DATE_PRESETS = REPORT_DATE_PRESETS; // Compatibility for existing consumers.
function validDate(key) { return /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(parseDate(key)) === key; }

function resolveDateRange(presetKey, opts) {
  opts = opts || {};
  const availableStart = opts.availableStart || '0001-01-01';
  const availableEnd = opts.availableEnd || dateKeyFromDate(opts.nowDate || new Date());
  const today = dateKeyFromDate(opts.nowDate || new Date());
  // Calendar identity comes from London today, never a stale export's last row.
  const anchor = addDays(today, -1);
  const y = Number(today.slice(0, 4));
  let startDate, endDate, label;

  switch (presetKey) {
    case 'today': startDate = endDate = today; label = 'Today'; break;
    case 'yesterday': startDate = endDate = anchor; label = 'Yesterday'; break;
    case 'last7': startDate = addDays(anchor, -6); endDate = anchor; label = 'Last 7 days'; break;
    case 'last30': startDate = addDays(anchor, -29); endDate = anchor; label = 'Last 30 days'; break;
    case 'thisMonth': startDate = startOfMonth(today); endDate = anchor; label = 'This month'; break;
    case 'lastMonth': {
      const p = addMonthsDate(startOfMonth(today), -1);
      startDate = startOfMonth(p); endDate = endOfMonth(p); label = 'Last month'; break;
    }
    case 'thisYear': startDate = `${y}-01-01`; endDate = anchor; label = `${y} year to date`; break;
    case 'lastYear': startDate = `${y - 1}-01-01`; endDate = `${y - 1}-12-31`; label = String(y - 1); break;
    case 'year2024': startDate = '2024-01-01'; endDate = '2024-12-31'; label = 'Calendar year 2024'; break;
    case 'year2025': startDate = '2025-01-01'; endDate = '2025-12-31'; label = 'Calendar year 2025'; break;
    case 'year2026YTD': startDate = '2026-01-01'; endDate = minKey(anchor, '2026-12-31'); label = '2026 year to date'; break;
    case 'currentFY': {
      const month = Number(today.slice(5, 7)); const startYear = month >= 8 ? y : y - 1;
      startDate = `${startYear}-08-01`; endDate = anchor; label = `FY${String(startYear + 1).slice(-2)} (to date)`; break;
    }
    case 'previousFY': {
      const month = Number(today.slice(5, 7)); const currentStart = month >= 8 ? y : y - 1;
      startDate = `${currentStart - 1}-08-01`; endDate = `${currentStart}-07-31`; label = `FY${String(currentStart).slice(-2)}`; break;
    }
    case 'last12Months': startDate = addDays(addMonthsDate(anchor, -12), 1); endDate = anchor; label = 'Last 12 months (rolling calendar months)'; break;
    case 'custom':
      if (!opts.customStart || !opts.customEnd) return { unsupported: true, reason: 'Pick a start and end date.', presetKey };
      if (!validDate(opts.customStart) || !validDate(opts.customEnd)) return { unsupported: true, reason: 'Enter valid start and end dates.', presetKey };
      startDate = opts.customStart; endDate = opts.customEnd; label = 'Custom range'; break;
    default: return { unsupported: true, reason: 'Unknown date range.', presetKey };
  }
  if (startDate > endDate) return { unsupported: true, reason: presetKey === 'custom' ? 'Start date must be before end date.' : 'No completed reporting day in this period yet.', presetKey };
  const outsideCoverage = startDate < availableStart || endDate > availableEnd;
  return { startDate, endDate, endExclusive: addDays(endDate, 1), startPeriod: startDate, endPeriod: endDate, label, presetKey,
    outsideCoverage, warning: outsideCoverage ? `Requested dates are preserved. Imported history spans ${availableStart} to ${availableEnd}; coverage outside it is unavailable.` : null };
}

function aggregate(records, opts) {
  const channels = opts.channels;
  const startDate = normalizeStart(opts.startDate || opts.startPeriod);
  const endDate = normalizeEnd(opts.endDate || opts.endPeriod);
  const endExclusive = addDays(endDate, 1);
  const nowDate = normalizeEnd(opts.nowDate || opts.nowPeriod || dateKeyFromDate(new Date()));
  if (startDate > nowDate) {
    return { revenue: null, orders: null, units: null, aov: null, status: 'not-occurred', recordCount: 0, channels, startDate, endDate, note: 'This period is in the future.' };
  }
  const matches = records.filter((r) => {
    const d = r.date || normalizeStart(r.period);
    return channels.includes(r.channel) && d >= startDate && d < endExclusive;
  });
  if (!matches.length) {
    return { revenue: null, orders: null, units: null, aov: null, status: 'no-data', recordCount: 0, channels, startDate, endDate, note: 'No imported sales recorded for this selection.' };
  }
  const sum = (metric) => matches.every((r) => r[metric] != null && Number.isFinite(Number(r[metric])))
    ? matches.reduce((s, r) => s + Number(r[metric]), 0) : null;
  const revenue = sum('revenue'), orders = sum('orders'), units = sum('units');
  const present = new Set(matches.map((r) => `${r.date || normalizeStart(r.period)}:${r.channel}`));
  let gapCount = 0;
  for (let day = startDate; day < endExclusive; day = addDays(day, 1)) {
    for (const channel of channels) if (!present.has(`${day}:${channel}`)) gapCount++;
  }
  const incomplete = gapCount > 0 || revenue == null || orders == null || units == null || matches.some((r) => !['complete', 'partial'].includes(r.completeness || 'complete'));
  const partial = matches.some((r) => r.completeness === 'partial');
  return {
    revenue, orders, units, aov: revenue != null && orders > 0 ? revenue / orders : null,
    status: incomplete ? 'incomplete-data' : partial ? 'partial' : 'complete', recordCount: matches.length,
    channels, startDate, endDate, endExclusive, gapCount,
    note: incomplete ? `Coverage unverified: ${gapCount} day/channel entries absent; absence may mean no sales or missing imports. Shown amounts are recorded subtotals; comparisons are unavailable.` : partial ? 'Includes a partially completed source day; comparisons are unavailable.' : null,
  };
}

function compareAggregates(currentAgg, previousAgg, metric) {
  const cur = currentAgg ? currentAgg[metric] : null;
  const prev = previousAgg ? previousAgg[metric] : null;
  if (!currentAgg || currentAgg.status === 'not-occurred') return { status: 'not-occurred', current: null, previous: prev, absoluteChange: null, percentChange: null, note: 'This period has not happened yet.' };
  if (currentAgg.status === 'no-data') return { status: 'no-comparison-data', current: null, previous: prev, absoluteChange: null, percentChange: null, note: 'No data recorded for the current period.' };
  if (!previousAgg || previousAgg.status === 'no-data' || previousAgg.status === 'not-occurred') return { status: 'no-comparison-data', current: cur, previous: null, absoluteChange: null, percentChange: null, note: 'No comparable data available for the prior period.' };
  if (currentAgg.status !== 'complete' || previousAgg.status !== 'complete' || cur == null || prev == null || currentAgg.truncated || previousAgg.truncated) return { status: 'incomplete-data', current: cur, previous: prev, absoluteChange: null, percentChange: null, note: 'Comparison unavailable: both periods must have complete, comparable coverage.' };
  const absoluteChange = cur - prev;
  if (prev === 0) return { status: 'zero-denominator', current: cur, previous: prev, absoluteChange, percentChange: null, note: 'Prior period is zero — percentage change is not meaningful.' };
  return { status: 'ok', current: cur, previous: prev, absoluteChange, percentChange: (cur / prev - 1) * 100, note: currentAgg.note };
}

function alignBucketStart(granularity, key) {
  const d = parseDate(normalizeStart(key)); const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  if (granularity === 'daily') return dateKey(d);
  if (granularity === 'weekly') { const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - day + 1); return dateKey(d); }
  if (granularity === 'monthly') return `${y}-${pad(m + 1)}-01`;
  if (granularity === 'quarterly') return `${y}-${pad(Math.floor(m / 3) * 3 + 1)}-01`;
  if (granularity === 'calendar-year') return `${y}-01-01`;
  if (granularity === 'financial-year') return `${m >= 7 ? y : y - 1}-08-01`;
  throw new Error('Unknown granularity: ' + granularity);
}
function bucketEnd(granularity, start) {
  if (granularity === 'daily') return start;
  if (granularity === 'weekly') return addDays(start, 6);
  if (granularity === 'monthly') return endOfMonth(start);
  if (granularity === 'quarterly') return addDays(addMonthsDate(start, 3), -1);
  return addDays(addMonthsDate(start, 12), -1);
}
function nextBucket(granularity, start) {
  if (granularity === 'daily') return addDays(start, 1);
  if (granularity === 'weekly') return addDays(start, 7);
  if (granularity === 'monthly') return addMonthsDate(start, 1);
  if (granularity === 'quarterly') return addMonthsDate(start, 3);
  return addMonthsDate(start, 12);
}
function bucketLabel(granularity, start) {
  const d = parseDate(start); const y = d.getUTCFullYear(); const m = d.getUTCMonth() + 1;
  if (granularity === 'daily') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (granularity === 'weekly') return 'w/c ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (granularity === 'monthly') return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  if (granularity === 'quarterly') return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  if (granularity === 'calendar-year') return String(y);
  return 'FY' + String(y + 1).slice(-2);
}
function makeBucket(granularity, start) { return { key: start, label: bucketLabel(granularity, start), startDate: start, endDate: bucketEnd(granularity, start), startPeriod: start, endPeriod: bucketEnd(granularity, start), granularity }; }
function bucketsForGranularity(granularity, from, to) {
  const out = []; let start = alignBucketStart(granularity, from); const end = normalizeEnd(to);
  while (start <= end) { out.push(makeBucket(granularity, start)); start = nextBucket(granularity, start); }
  return out;
}
function shiftBucket(bucket, direction) {
  let start;
  if (bucket.granularity === 'daily') start = addDays(bucket.startDate, direction);
  else if (bucket.granularity === 'weekly') start = addDays(bucket.startDate, direction * 7);
  else if (bucket.granularity === 'monthly') start = addMonthsDate(bucket.startDate, direction);
  else if (bucket.granularity === 'quarterly') start = addMonthsDate(bucket.startDate, direction * 3);
  else start = addMonthsDate(bucket.startDate, direction * 12);
  return makeBucket(bucket.granularity, start);
}
function previousBucket(bucket) { return shiftBucket(bucket, -1); }
function yearEarlierBucket(bucket) { return makeBucket(bucket.granularity, bucket.granularity === 'weekly' ? addDays(bucket.startDate, -364) : addMonthsDate(bucket.startDate, -12)); }

function selectedBucket(bucket, from, to) {
  const startDate = maxKey(bucket.startDate, normalizeStart(from)), endDate = minKey(bucket.endDate, normalizeEnd(to));
  return { ...bucket, startDate, endDate, startPeriod: startDate, endPeriod: endDate,
    truncated: startDate !== bucket.startDate || endDate !== bucket.endDate };
}

function buildComparisonTable(records, opts) {
  const buckets = bucketsForGranularity(opts.granularity, opts.fromPeriod, opts.toPeriod);
  const rows = buckets.map((bucket) => {
    const selected = selectedBucket(bucket, opts.fromPeriod, opts.toPeriod);
    const current = { ...aggregate(records, { channels: opts.channels, startDate: selected.startDate, endDate: selected.endDate, nowDate: opts.nowDate || opts.nowPeriod }), truncated: selected.truncated };
    const prev = previousBucket(bucket); const yoy = yearEarlierBucket(bucket);
    const previous = aggregate(records, { channels: opts.channels, startDate: prev.startDate, endDate: prev.endDate, nowDate: opts.nowDate || opts.nowPeriod });
    const yearAgo = aggregate(records, { channels: opts.channels, startDate: yoy.startDate, endDate: yoy.endDate, nowDate: opts.nowDate || opts.nowPeriod });
    return { bucket: selected, current, mom: compareAggregates(current, previous, opts.metric), yoy: compareAggregates(current, yearAgo, opts.metric) };
  });
  const totals = aggregate(records, { channels: opts.channels, startDate: opts.fromPeriod, endDate: opts.toPeriod, nowDate: opts.nowDate || opts.nowPeriod });
  return { rows, totals, metric: opts.metric, granularity: opts.granularity };
}

function previousEquivalentRange(start, end) {
  const s = normalizeStart(start), e = normalizeEnd(end);
  const days = Math.round((parseDate(e) - parseDate(s)) / DAY_MS) + 1;
  const endDate = addDays(s, -1); const startDate = addDays(endDate, -(days - 1));
  return { startDate, endDate, startPeriod: startDate, endPeriod: endDate };
}
function yearEarlierRange(start, end) {
  const startDate = addMonthsDate(normalizeStart(start), -12), endDate = addMonthsDate(normalizeEnd(end), -12);
  return { startDate, endDate, startPeriod: startDate, endPeriod: endDate };
}
function rangeLengthMonths(start, end) { const s = parseDate(normalizeStart(start)), e = parseDate(normalizeEnd(end)); return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth() + 1; }

function channelContribution(records, opts) {
  const channels = opts.channels.map((channel) => ({ channel, ...aggregate(records, { ...opts, channels: [channel] }) }));
  const totalRevenue = channels.reduce((s, c) => s + (c.revenue || 0), 0);
  return {
    channels: channels.map((c) => ({ ...c, pctOfRevenue: channels.every((a) => a.status === 'complete') && c.revenue != null && totalRevenue > 0 ? c.revenue / totalRevenue : null })),
    totals: aggregate(records, opts),
  };
}

function buildSeries(records, opts) {
  const buckets = bucketsForGranularity(opts.granularity, opts.fromPeriod, opts.toPeriod);
  const groups = opts.seriesMode === 'byChannel' ? opts.channels.map((c) => [c]) : [opts.channels];
  const makeSeries = (comparison) => groups.map((channels) => ({
    key: (channels.length === 1 ? channels[0] : 'all') + (comparison ? ':compare' : ''),
    channels,
    points: buckets.map((bucket) => {
      const selected = selectedBucket(bucket, opts.fromPeriod, opts.toPeriod);
      const target = comparison === 'previous-year' ? yearEarlierBucket(bucket) : comparison === 'previous-period' ? previousBucket(bucket) : selected;
      const agg = aggregate(records, { channels, startDate: target.startDate, endDate: target.endDate, nowDate: opts.nowDate || opts.nowPeriod });
      if (comparison) {
        const current = { ...aggregate(records, { channels, startDate: selected.startDate, endDate: selected.endDate, nowDate: opts.nowDate || opts.nowPeriod }), truncated: selected.truncated };
        if (compareAggregates(current, agg, opts.metric).status !== 'ok') return { bucket: target, value: null, status: 'incomplete-data', note: 'Comparison unavailable for incomplete periods.' };
      }
      return { bucket: target, value: agg[opts.metric], status: agg.status, note: agg.note };
    }),
  }));
  return { buckets, series: makeSeries(null), comparisonSeries: opts.comparison && opts.comparison !== 'none' ? makeSeries(opts.comparison) : null, metric: opts.metric, granularity: opts.granularity };
}

return {
  dateKeyFromDate, monthKeyFromDate, addDays, addMonthsDate,
  REPORT_DATE_PRESETS, DATE_PRESETS, resolveDateRange, aggregate, compareAggregates,
  bucketsForGranularity, previousBucket, yearEarlierBucket, alignBucketStart, makeBucket,
  previousEquivalentRange, yearEarlierRange, rangeLengthMonths,
  buildComparisonTable, channelContribution, buildSeries,
};

});
