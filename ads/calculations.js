// ============================================================
// PAID ADS TAB — calculations
// ------------------------------------------------------------
// Pure functions only (no DOM, no React) — see ads/test/calculations.test.js.
// Mirrors the same rules established across this whole dashboard:
//  - ROAS/CPA/CTR/CPC are always derived from summed totals, never
//    averaged from per-day or per-channel ratios.
//  - A day with no ad data recorded is never silently zero.
//  - A future date range is "not-occurred", not zero, not missing.
//  - A percentage change is never computed against a zero or missing
//    denominator.
//  - Today, while still in progress, is labelled "partial" rather
//    than silently compared as a finished day.
// ============================================================

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.AdsCalc = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDateISO(d) { return new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit'}).format(d); }
function civilISO(d) { return d.toISOString().slice(0,10); }
function parseISO(s) { return new Date(s + 'T00:00:00Z'); }
function addDays(dateStr, n) { const d = parseISO(dateStr); d.setUTCDate(d.getUTCDate() + n); return civilISO(d); }
function shiftYear(dateStr, deltaYears) { const d = parseISO(dateStr); d.setUTCFullYear(d.getUTCFullYear() + deltaYears); return civilISO(d); }
function startOfMonth(dateStr) { return dateStr.slice(0,7)+'-01'; }
function endOfMonth(dateStr) { const d = parseISO(dateStr); return civilISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0))); }
function startOfQuarter(dateStr) { const d = parseISO(dateStr); return civilISO(new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth()/3)*3, 1))); }
function startOfYear(dateStr) { return dateStr.slice(0,4)+'-01-01'; }
function mondayOf(dateStr) { const d = parseISO(dateStr); d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7); return civilISO(d); }
function compareDates(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function rangeLengthDays(start, end) { return Math.round((parseISO(end) - parseISO(start)) / 86400000) + 1; }

// ── date-range presets ──────────────────────────────────────
const ADS_DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 completed days' },
  { key: 'last30', label: 'Last 30 completed days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisQuarter', label: 'This quarter' },
  { key: 'thisYear', label: 'This year' },
  { key: 'last12Months', label: 'Last 365 days' },
  { key: 'custom', label: 'Custom range' },
];

function resolveAdsDateRange(preset, opts) {
  opts = opts || {};
  const today = opts.todayStr || fmtDateISO(new Date());
  switch (preset) {
    case 'today': return { start: today, end: today, label: 'Today' };
    case 'yesterday': { const y = addDays(today, -1); return { start: y, end: y, label: 'Yesterday' }; }
    case 'last7': return { start: addDays(today, -7), end: addDays(today,-1), label: 'Last 7 completed days' };
    case 'last30': return { start: addDays(today, -30), end: addDays(today,-1), label: 'Last 30 completed days' };
    case 'thisMonth': return { start: startOfMonth(today), end: today, label: 'This month' };
    case 'lastMonth': { const lm = addDays(startOfMonth(today), -1); return { start: startOfMonth(lm), end: endOfMonth(lm), label: 'Last month' }; }
    case 'thisQuarter': return { start: startOfQuarter(today), end: today, label: 'This quarter' };
    case 'thisYear': return { start: startOfYear(today), end: today, label: 'This year' };
    case 'last12Months': return { start: addDays(today, -364), end: today, label: 'Last 365 days' };
    case 'custom':
      if (!opts.customStart || !opts.customEnd) return { unsupported: true, reason: 'Pick a start and end date.' };
      if (compareDates(opts.customStart, opts.customEnd) > 0) return { unsupported: true, reason: 'Start date must be before end date.' };
      return { start: opts.customStart, end: opts.customEnd, label: 'Custom range' };
    default: return { unsupported: true, reason: 'Unknown date range.' };
  }
}

function previousEquivalentRange(start, end) {
  const len = rangeLengthDays(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(len - 1));
  return { start: prevStart, end: prevEnd };
}
function yearEarlierRange(start, end) {
  return { start: shiftYear(start, -1), end: shiftYear(end, -1) };
}

// ── aggregation over a [start,end] date range ───────────────
// channels: array of 'meta' | 'google'. daysData: the ads-data.json `days` object.
function adsAggregate(daysData, start, end, channels, todayStr) {
  todayStr = todayStr || fmtDateISO(new Date());
  const allDates = [];
  for (let d = start; compareDates(d, end) <= 0; d = addDays(d, 1)) allDates.push(d);
  const occurred = allDates.filter((d) => compareDates(d, todayStr) <= 0);

  if (occurred.length === 0) {
    return { status: 'not-occurred', spend: null, conversions: null, conversionValue: null, clicks: null, impressions: null,
      roas: null, cpa: null, cpc: null, ctr: null, start, end, note: 'This period is in the future.' };
  }

  let spend = 0, conversions = 0, conversionValue = 0, clicks = 0, impressions = 0, foundCount = 0, isPartial = false;
  const expectedCount = occurred.length * channels.length;
  const missingMetrics=new Set();

  occurred.forEach((d) => {
    channels.forEach((ch) => {
      const rec = daysData[d] && daysData[d][ch];
      if (rec && rec.spend != null) {
        foundCount++;
        spend += rec.spend;
        for(const k of ['conversions','conversionValue','clicks','impressions'])if(typeof rec[k]!=='number'||!Number.isFinite(rec[k]))missingMetrics.add(k);
        conversions += rec.conversions || 0; conversionValue += rec.conversionValue || 0;
        clicks += rec.clicks || 0; impressions += rec.impressions || 0;
        if (d === todayStr) isPartial = true;
      }
    });
  });

  let status;
  if (foundCount === 0) status = 'no-data';
  else if (foundCount < expectedCount || missingMetrics.size) status = 'incomplete-data';
  else if (isPartial) status = 'partial';
  else status = 'complete';

  let note = null;
  if (status === 'no-data') note = `No ad data recorded for this period: ${expectedCount} channel-days missing.`;
  else if (status === 'incomplete-data') note = `Data missing for ${expectedCount - foundCount} of ${expectedCount} channel-days in this range.` + (missingMetrics.size ? ' Missing metric fields: '+[...missingMetrics].join(', ')+'.' : '');
  else if (status === 'partial') note = 'Today is still in progress — figures are so-far-today.';

  return {
    status,
    spend: foundCount ? Math.round(spend * 100) / 100 : null,
    conversions: foundCount && !missingMetrics.has('conversions') ? conversions : null,
    conversionValue: foundCount && !missingMetrics.has('conversionValue') ? Math.round(conversionValue * 100) / 100 : null,
    clicks: foundCount && !missingMetrics.has('clicks') ? clicks : null,
    impressions: foundCount && !missingMetrics.has('impressions') ? impressions : null,
    roas: (foundCount && spend > 0 && !missingMetrics.has('conversionValue')) ? conversionValue / spend : null,
    cpa: (foundCount && conversions > 0 && !missingMetrics.has('conversions')) ? spend / conversions : null,
    cpc: (foundCount && clicks > 0 && !missingMetrics.has('clicks')) ? spend / clicks : null,
    ctr: (foundCount && impressions > 0 && !missingMetrics.has('clicks') && !missingMetrics.has('impressions')) ? clicks / impressions : null,
    start, end, foundCount, expectedCount, note,
  };
}

function adsCompare(current, previous, metric) {
  const cur = current ? current[metric] : null;
  const prev = previous ? previous[metric] : null;

  if (!current || current.status === 'not-occurred') return { status: 'not-occurred', current: null, previous: prev, absoluteChange: null, percentChange: null, note: 'This period has not happened yet.' };
  if (current.status === 'no-data') return { status: 'no-comparison-data', current: null, previous: prev, absoluteChange: null, percentChange: null, note: 'No data recorded for the current period.' };
  if (!previous || previous.status === 'no-data' || previous.status === 'not-occurred') return { status: 'no-comparison-data', current: cur, previous: null, absoluteChange: null, percentChange: null, note: 'No comparable data for the prior period.' };
  if (current.status !== 'complete' || previous.status !== 'complete') return { status: 'incomplete-data', current: cur, previous: prev, absoluteChange: null, percentChange: null, note: 'Comparison unavailable: incomplete daily coverage.' };

  const absoluteChange = (cur != null && prev != null) ? cur - prev : null;
  let status = 'ok', percentChange = null, note = null;
  if (prev === 0) { status = 'zero-denominator'; note = 'Prior period is zero — percentage change is not meaningful.'; }
  else if (prev != null && cur != null) percentChange = (cur / prev - 1) * 100;

  if (current.status === 'partial') { status = status === 'ok' ? 'incomplete-current' : status; note = (note ? note + ' ' : '') + 'Today is still in progress.'; }
  return { status, current: cur, previous: prev, absoluteChange, percentChange, note };
}

// ── granularity buckets ──────────────────────────────────────
function shortDateLabel(dateStr) {
  const d = parseISO(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone:'UTC' });
}
function monthLabelOf(dateStr) {
  const d = parseISO(dateStr);
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone:'UTC' });
}

function adsBucketsForGranularity(granularity, start, end) {
  const buckets = [];
  if (granularity === 'daily') {
    for (let d = start; compareDates(d, end) <= 0; d = addDays(d, 1)) {
      buckets.push({ key: d, label: shortDateLabel(d), start: d, end: d, granularity });
    }
  } else if (granularity === 'weekly') {
    for (let wkStart = mondayOf(start); compareDates(wkStart, end) <= 0; wkStart = addDays(wkStart, 7)) {
      const wkEnd = addDays(wkStart, 6);
      buckets.push({ key: wkStart, label: shortDateLabel(wkStart), start: wkStart, end: wkEnd, granularity });
    }
  } else if (granularity === 'monthly') {
    for (let mStart = startOfMonth(start); compareDates(mStart, end) <= 0; mStart = addDays(endOfMonth(mStart), 1)) {
      buckets.push({ key: mStart.slice(0, 7), label: monthLabelOf(mStart), start: mStart, end: endOfMonth(mStart), granularity });
    }
  } else {
    throw new Error('Unknown ads granularity: ' + granularity);
  }
  return buckets;
}

function adsPreviousBucket(bucket) {
  if (bucket.granularity === 'monthly') {
    const prevStart = startOfMonth(addDays(bucket.start, -1));
    return { key: prevStart.slice(0, 7), label: monthLabelOf(prevStart), start: prevStart, end: endOfMonth(prevStart), granularity: 'monthly' };
  }
  const len = rangeLengthDays(bucket.start, bucket.end);
  const newStart = addDays(bucket.start, -len);
  const newEnd = addDays(bucket.end, -len);
  return { key: newStart, label: shortDateLabel(newStart), start: newStart, end: newEnd, granularity: bucket.granularity };
}

function adsYearEarlierBucket(bucket) {
  const newStart = shiftYear(bucket.start, -1);
  const newEnd = shiftYear(bucket.end, -1);
  const label = bucket.granularity === 'monthly' ? monthLabelOf(newStart) : shortDateLabel(newStart);
  return { key: bucket.granularity === 'monthly' ? newStart.slice(0, 7) : newStart, label, start: newStart, end: newEnd, granularity: bucket.granularity };
}

return {
  fmtDateISO, addDays, shiftYear, startOfMonth, endOfMonth, startOfQuarter, startOfYear, mondayOf, compareDates, rangeLengthDays,
  ADS_DATE_PRESETS, resolveAdsDateRange, previousEquivalentRange, yearEarlierRange,
  adsAggregate, adsCompare, adsBucketsForGranularity, adsPreviousBucket, adsYearEarlierBucket,
  shortDateLabel, monthLabelOf,
};

});
