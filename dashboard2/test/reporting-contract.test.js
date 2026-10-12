const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../calculations.js');
const M = require('../data-model.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok - ' + name); }
const opts = { nowDate: new Date('2026-10-08T12:00:00Z'), availableStart: '2024-01-01', availableEnd: '2026-09-24' };
function daily(start, end, channel = 'shopify') {
  const rows = [];
  for (let day = start; day <= end; day = C.addDays(day, 1)) rows.push({ date: day, channel, revenue: 10, orders: 2, units: 3, completeness: 'complete' });
  return rows;
}
const aggregate = (rows, start, end, channels = ['shopify']) => C.aggregate(rows, { channels, startDate: start, endDate: end, nowDate: '2026-10-08' });
test('all eleven ordered presets work through one resolver', () => {
  assert.deepEqual(C.REPORT_DATE_PRESETS.map(p => p.key), ['currentFY', 'previousFY', 'last12Months', 'year2024', 'year2025', 'year2026YTD', 'thisMonth', 'lastMonth', 'last30', 'last7', 'custom']);
  for (const p of C.REPORT_DATE_PRESETS) {
    const r = C.resolveDateRange(p.key, { ...opts, customStart: '2024-01-01', customEnd: '2024-12-31' });
    assert.equal(r.unsupported, undefined, p.key);
    assert.equal(r.endExclusive, C.addDays(r.endDate, 1));
  }
});
test('previous FY is exactly August–July, even with stale history', () => {
  const r = C.resolveDateRange('previousFY', { ...opts, availableEnd: '2025-06-01' });
  assert.deepEqual([r.startDate, r.endDate], ['2025-08-01', '2026-07-31']);
  assert.equal(r.outsideCoverage, true);
});
test('FY boundary keeps new FY identity before its first completed day', () => {
  const o = { ...opts, nowDate: new Date('2026-07-31T23:30:00Z') };
  assert.equal(C.resolveDateRange('currentFY', o).unsupported, true);
  assert.equal(C.resolveDateRange('previousFY', o).endDate, '2026-07-31');
});
test('month boundary does not mislabel last month as this month', () => {
  const o = { ...opts, nowDate: new Date('2026-10-01T12:00:00Z') };
  assert.equal(C.resolveDateRange('thisMonth', o).unsupported, true);
  assert.equal(C.resolveDateRange('lastMonth', o).endDate, '2026-09-30');
});
test('London clock handles both DST transitions and BST midnight independently of host TZ', () => {
  assert.equal(C.dateKeyFromDate(new Date('2026-03-29T23:30:00Z')), '2026-03-30');
  assert.equal(C.dateKeyFromDate(new Date('2026-10-25T23:30:00Z')), '2026-10-25');
  assert.equal(C.dateKeyFromDate(new Date('2026-07-31T23:30:00Z')), '2026-08-01');
});
test('rolling calendar months include leap day, not a hard-coded 365 days', () => {
  const r = C.resolveDateRange('last12Months', { ...opts, nowDate: new Date('2024-03-01T12:00:00Z') });
  assert.deepEqual([r.startDate, r.endDate], ['2023-03-01', '2024-02-29']);
});
test('2024 stays available and 2023 stays no-data without clipping', () => {
  assert.equal(C.resolveDateRange('year2024', opts).startDate, '2024-01-01');
  const r = C.resolveDateRange('custom', { ...opts, customStart: '2023-01-01', customEnd: '2023-12-31' });
  assert.equal(r.startDate, '2023-01-01');
  assert.equal(r.outsideCoverage, true);
  assert.equal(aggregate(daily('2024-01-01', '2024-01-31'), r.startDate, r.endDate).revenue, null);
});
test('invalid dates, missing dates and reversed custom dates are rejected', () => {
  for (const [customStart, customEnd] of [['2026-02-30', '2026-03-02'], ['', '2026-03-02'], ['2026-03-02', '2026-03-01']]) assert.equal(C.resolveDateRange('custom', { ...opts, customStart, customEnd }).unsupported, true);
});
test('a single missing day or missing channel suppresses both comparison directions', () => {
  const complete = aggregate(daily('2026-01-01', '2026-01-31'), '2026-01-01', '2026-01-31');
  const missing = aggregate(daily('2026-01-02', '2026-01-31'), '2026-01-01', '2026-01-31');
  assert.equal(missing.revenue, 300);
  assert.equal(missing.gapCount, 1);
  assert.equal(missing.status, 'incomplete-data');
  assert.equal(C.compareAggregates(complete, missing, 'revenue').percentChange, null);
  assert.equal(C.compareAggregates(missing, complete, 'revenue').absoluteChange, null);
  assert.equal(aggregate(daily('2026-01-01', '2026-01-31'), '2026-01-01', '2026-01-31', ['shopify', 'etsy']).gapCount, 31);
});
test('an absent entire month cannot produce complete multi-month growth', () => {
  const a = aggregate([...daily('2026-01-01', '2026-01-31'), ...daily('2026-03-01', '2026-03-31')], '2026-01-01', '2026-03-31');
  assert.equal(a.gapCount, 28);
  assert.equal(a.status, 'incomplete-data');
});
test('known zero differs from unknown amounts and zero-order AOV is unavailable', () => {
  const r = daily('2026-01-01', '2026-01-01');
  r[0].revenue = null;
  assert.equal(aggregate(r, '2026-01-01', '2026-01-01').revenue, null);
  r[0].revenue = 0; r[0].orders = 0;
  const a = aggregate(r, '2026-01-01', '2026-01-01');
  assert.equal(a.revenue, 0); assert.equal(a.aov, null); assert.equal(a.status, 'complete');
});
test('adapter preserves null instead of converting it to zero', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../data-adapter.js'), 'utf8'), context);
  assert.equal(context.RorDataAdapter.normalizeRecord({revenue:null}).revenue, null);
  assert.equal(context.RorDataAdapter.normalizeRecord({}).orders, null);
});
test('partial data never produces growth', () => {
  const r = daily('2026-01-01', '2026-01-01'); r[0].completeness = 'partial';
  const a = aggregate(r, '2026-01-01', '2026-01-01');
  assert.equal(C.compareAggregates(a, a, 'revenue').percentChange, null);
});
test('monthly table and chart respect custom endpoints and reconcile to the selected total', () => {
  const rows = daily('2025-01-01', '2026-03-31');
  const o = { channels:['shopify'], granularity:'monthly', fromPeriod:'2026-01-15', toPeriod:'2026-02-10', metric:'revenue', nowDate:'2026-10-08', comparison:'previous-year' };
  const table = C.buildComparisonTable(rows, o), series = C.buildSeries(rows, o);
  assert.equal(table.rows.reduce((s,r)=>s+r.current.revenue,0), table.totals.revenue);
  assert.equal(series.series[0].points.reduce((s,p)=>s+p.value,0), table.totals.revenue);
  assert.equal(table.totals.revenue, 270);
  assert.equal(table.rows[0].mom.percentChange, null);
  assert.equal(series.comparisonSeries[0].points[0].value, null);
});
test('end-exclusive filtering excludes next-day facts', () => {
  assert.equal(aggregate(daily('2026-01-01', '2026-01-03'), '2026-01-01', '2026-01-02').revenue, 20);
});
test('weekly YoY shifts 52 weeks and preserves Monday', () => {
  const r = C.yearEarlierBucket(C.makeBucket('weekly','2026-09-07'));
  assert.equal(r.startDate, '2025-09-08');
  assert.equal(new Date(r.startDate).getUTCDay(), 1);
});
test('incomplete contribution never reports apparently complete shares', () => {
  const r = C.channelContribution(daily('2026-01-01', '2026-01-01'), {channels:['shopify','etsy'],startDate:'2026-01-01',endDate:'2026-01-01'});
  assert.ok(r.channels.every(c=>c.pctOfRevenue === null));
});
test('metric dictionary distinguishes gross imports, Shopify total sales, attribution and estimates', () => {
  assert.match(M.METRICS.revenue.label, /gross line/);
  assert.match(M.METRICS.shopifyTotalSales.basis, /shipping and taxes/);
  assert.match(M.METRICS.attributedValue.basis, /overlaps/);
  assert.equal(M.METRICS.estimatedProfit.reconciliation_status, 'estimated');
});
console.log(`\n${passed} reporting contract tests passed`);
