// Plain-Node unit tests for ads/calculations.js — no test framework
// dependency, matches the rest of this repo's test files.
// Run: node ads/test/calculations.test.js

const assert = require('assert');
const C = require('../calculations.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  - ' + name); }
  catch (e) { failed++; console.log('FAIL  - ' + name); console.log('       ' + e.message); }
}

const TODAY = '2026-09-26';

function day(spend, conversions, conversionValue, clicks, impressions) {
  return { spend, conversions, conversionValue, clicks, impressions, source: 'test' };
}

test('resolveAdsDateRange: today/yesterday/last7/last30 line up', () => {
  const t = C.resolveAdsDateRange('today', { todayStr: TODAY });
  assert.strictEqual(t.start, TODAY); assert.strictEqual(t.end, TODAY);
  const y = C.resolveAdsDateRange('yesterday', { todayStr: TODAY });
  assert.strictEqual(y.start, '2026-09-25'); assert.strictEqual(y.end, '2026-09-25');
  const l7 = C.resolveAdsDateRange('last7', { todayStr: TODAY });
  assert.strictEqual(l7.start, '2026-09-20'); assert.strictEqual(l7.end, TODAY);
  assert.strictEqual(C.rangeLengthDays(l7.start, l7.end), 7);
  const l30 = C.resolveAdsDateRange('last30', { todayStr: TODAY });
  assert.strictEqual(C.rangeLengthDays(l30.start, l30.end), 30);
});

test('resolveAdsDateRange: thisMonth/lastMonth/thisQuarter/thisYear', () => {
  const tm = C.resolveAdsDateRange('thisMonth', { todayStr: TODAY });
  assert.strictEqual(tm.start, '2026-09-01'); assert.strictEqual(tm.end, TODAY);
  const lm = C.resolveAdsDateRange('lastMonth', { todayStr: TODAY });
  assert.strictEqual(lm.start, '2026-08-01'); assert.strictEqual(lm.end, '2026-08-31');
  const tq = C.resolveAdsDateRange('thisQuarter', { todayStr: TODAY }); // Sep is in Jul-Sep quarter
  assert.strictEqual(tq.start, '2026-07-01');
  const ty = C.resolveAdsDateRange('thisYear', { todayStr: TODAY });
  assert.strictEqual(ty.start, '2026-01-01');
});

test('resolveAdsDateRange: custom validates start<=end and requires both dates', () => {
  assert.strictEqual(C.resolveAdsDateRange('custom', {}).unsupported, true);
  assert.strictEqual(C.resolveAdsDateRange('custom', { customStart: '2026-09-05', customEnd: '2026-09-01' }).unsupported, true);
  const ok = C.resolveAdsDateRange('custom', { customStart: '2026-09-01', customEnd: '2026-09-05' });
  assert.strictEqual(ok.start, '2026-09-01');
});

test('previousEquivalentRange shifts back by the range\'s own length (day-precision)', () => {
  const r = C.previousEquivalentRange('2026-09-20', '2026-09-26'); // 7 days
  assert.strictEqual(C.rangeLengthDays(r.start, r.end), 7);
  assert.strictEqual(r.end, '2026-09-19');
  assert.strictEqual(r.start, '2026-09-13');
});

test('yearEarlierRange shifts both ends back exactly one calendar year', () => {
  const r = C.yearEarlierRange('2026-09-20', '2026-09-26');
  assert.strictEqual(r.start, '2025-09-20');
  assert.strictEqual(r.end, '2025-09-26');
});

test('adsAggregate: sums raw components then derives ROAS/CPA/CTR/CPC — never averages ratios', () => {
  const days = {
    '2026-09-01': { meta: day(100, 2, 400, 50, 1000), google: day(50, 1, 100, 20, 500) }, // meta ROAS=4, google ROAS=2
    '2026-09-02': { meta: day(100, 1, 100, 50, 1000), google: day(50, 1, 100, 20, 500) },
  };
  const agg = C.adsAggregate(days, '2026-09-01', '2026-09-02', ['meta', 'google'], TODAY);
  assert.strictEqual(agg.status, 'complete');
  assert.strictEqual(agg.spend, 300);
  assert.strictEqual(agg.conversions, 5);
  assert.strictEqual(agg.conversionValue, 700);
  assert.strictEqual(agg.clicks, 140);
  // ROAS = totalValue/totalSpend, not average of per-row ROAS
  assert.ok(Math.abs(agg.roas - (700 / 300)) < 1e-9);
  assert.ok(Math.abs(agg.cpa - (300 / 5)) < 1e-9);
});

test('adsAggregate: missing days are "no-data", never zero', () => {
  const agg = C.adsAggregate({}, '2026-09-01', '2026-09-02', ['meta'], TODAY);
  assert.strictEqual(agg.status, 'no-data');
  assert.strictEqual(agg.spend, null);
});

test('adsAggregate: a future range is "not-occurred"', () => {
  const agg = C.adsAggregate({}, '2026-10-01', '2026-10-05', ['meta'], TODAY);
  assert.strictEqual(agg.status, 'not-occurred');
});

test('adsAggregate: today included in range is flagged "partial"', () => {
  const days = { [TODAY]: { meta: day(10, 1, 20, 5, 100), google: day(5, 0, 0, 2, 50) } };
  const agg = C.adsAggregate(days, TODAY, TODAY, ['meta', 'google'], TODAY);
  assert.strictEqual(agg.status, 'partial');
});

test('adsCompare: zero-denominator never produces Infinity/NaN', () => {
  const cur = { status: 'complete', spend: 100 };
  const prev = { status: 'complete', spend: 0 };
  const cmp = C.adsCompare(cur, prev, 'spend');
  assert.strictEqual(cmp.status, 'zero-denominator');
  assert.strictEqual(cmp.percentChange, null);
  assert.ok(Number.isFinite(cmp.absoluteChange));
});

test('adsBucketsForGranularity: daily/weekly/monthly produce sane, non-overlapping buckets', () => {
  const daily = C.adsBucketsForGranularity('daily', '2026-09-01', '2026-09-03');
  assert.strictEqual(daily.length, 3);
  assert.deepStrictEqual(daily.map(b => b.key), ['2026-09-01', '2026-09-02', '2026-09-03']);

  const weekly = C.adsBucketsForGranularity('weekly', '2026-09-01', '2026-09-20'); // Sep 1 2026 is a Tuesday
  assert.strictEqual(weekly[0].start, '2026-08-31'); // Monday before Sep 1
  assert.ok(weekly.length >= 3);

  const monthly = C.adsBucketsForGranularity('monthly', '2026-07-15', '2026-09-10');
  assert.deepStrictEqual(monthly.map(b => b.key), ['2026-07', '2026-08', '2026-09']);
});

test('adsPreviousBucket / adsYearEarlierBucket: monthly bucket steps to the correct prior month/year', () => {
  const buckets = C.adsBucketsForGranularity('monthly', '2026-09-01', '2026-09-01');
  const b = buckets[0];
  const prev = C.adsPreviousBucket(b);
  assert.strictEqual(prev.key, '2026-08');
  const yoy = C.adsYearEarlierBucket(b);
  assert.strictEqual(yoy.key, '2025-09');
});

test('adsPreviousBucket / adsYearEarlierBucket: daily bucket steps by exactly 1 day / 1 year', () => {
  const buckets = C.adsBucketsForGranularity('daily', '2026-09-26', '2026-09-26');
  const b = buckets[0];
  assert.strictEqual(C.adsPreviousBucket(b).key, '2026-09-25');
  assert.strictEqual(C.adsYearEarlierBucket(b).key, '2025-09-26');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
