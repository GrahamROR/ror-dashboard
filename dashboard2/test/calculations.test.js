const assert = require('assert');
const RorModel = require('../data-model.js');
const RorCalc = require('../calculations.js');
const productionData = require('../sales-data.json');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  - ' + name); }
  catch (error) { failed++; console.log('FAIL  - ' + name); console.log('       ' + error.message); }
}
function rec(date, channel, revenue, orders, units, completeness) {
  return { date, channel, revenue, orders, units, currency: 'GBP', source: 'test', completeness: completeness || 'complete' };
}

test('production export has a self-consistent range, sources, rows and units', () => {
  assert.strictEqual(productionData.meta.source_table, 'sales_history_items');
  assert.deepStrictEqual(productionData.meta.channels, ['etsy', 'noths', 'shopify']);
  assert.strictEqual(productionData.meta.includes_unmapped, true);
  assert.ok(Number.isInteger(productionData.meta.row_count) && productionData.meta.row_count > 0);
  assert.strictEqual(productionData.meta.earliest, productionData.records[0].date);
  assert.strictEqual(productionData.meta.latest, productionData.records[productionData.records.length - 1].date);
  assert.strictEqual(
    productionData.records.reduce((sum, r) => sum + r.units, 0),
    productionData.meta.unit_count
  );
});

test('AOV is total revenue divided by total orders and units are summed', () => {
  const rows = [rec('2026-01-01', 'shopify', 1000, 10, 14), rec('2026-01-01', 'etsy', 90, 30, 35)];
  const agg = RorCalc.aggregate(rows, { channels: ['shopify', 'etsy'], startDate: '2026-01-01', endDate: '2026-01-01', nowDate: '2026-06-01' });
  assert.strictEqual(agg.revenue, 1090);
  assert.strictEqual(agg.orders, 40);
  assert.strictEqual(agg.units, 49);
  assert.strictEqual(agg.aov, 1090 / 40);
});

test('mapping state cannot affect totals because the reporting contract ignores it', () => {
  const rows = [
    { ...rec('2026-01-01', 'shopify', 20, 1, 1), mapping_status: 'mapped' },
    { ...rec('2026-01-01', 'shopify', 30, 1, 2), mapping_status: 'unmapped' },
  ];
  const agg = RorCalc.aggregate(rows, { channels: ['shopify'], startDate: '2026-01-01', endDate: '2026-01-01', nowDate: '2026-06-01' });
  assert.deepStrictEqual([agg.revenue, agg.orders, agg.units], [50, 2, 3]);
});

test('MoM and YoY comparisons compute valid changes', () => {
  const jan = RorCalc.aggregate(Array.from({length: 31}, (_, i) => rec(RorCalc.addDays('2026-01-01', i), 'shopify', i ? 0 : 100, i ? 0 : 4, i ? 0 : 5)), { channels: ['shopify'], startDate: '2026-01-01', endDate: '2026-01-31', nowDate: '2026-06-01' });
  const feb = RorCalc.aggregate(Array.from({length: 28}, (_, i) => rec(RorCalc.addDays('2026-02-01', i), 'shopify', i ? 0 : 120, i ? 0 : 5, i ? 0 : 6)), { channels: ['shopify'], startDate: '2026-02-01', endDate: '2026-02-28', nowDate: '2026-06-01' });
  const cmp = RorCalc.compareAggregates(feb, jan, 'revenue');
  assert.strictEqual(cmp.absoluteChange, 20);
  assert.ok(Math.abs(cmp.percentChange - 20) < 1e-9);
});

test('date presets retain requested completed days when exports lag', () => {
  const opts = { nowDate: new Date(2026, 8, 28), availableStart: '2025-01-01', availableEnd: '2026-09-24' };
  assert.deepStrictEqual(
    [RorCalc.resolveDateRange('year2025', opts).startDate, RorCalc.resolveDateRange('year2025', opts).endDate],
    ['2025-01-01', '2025-12-31']
  );
  assert.deepStrictEqual(
    [RorCalc.resolveDateRange('year2026YTD', opts).startDate, RorCalc.resolveDateRange('year2026YTD', opts).endDate],
    ['2026-01-01', '2026-09-27']
  );
  const fy = RorCalc.resolveDateRange('currentFY', opts);
  assert.deepStrictEqual([fy.startDate, fy.endDate], ['2026-08-01', '2026-09-27']);
});

test('custom ranges retain requested dates and warn about unavailable coverage', () => {
  const base = { availableStart: '2024-01-01', availableEnd: '2026-09-24' };
  assert.strictEqual(RorCalc.resolveDateRange('custom', { ...base, customStart: '2023-01-01', customEnd: '2023-12-31' }).outsideCoverage, true);
  const clipped = RorCalc.resolveDateRange('custom', { ...base, customStart: '2023-12-01', customEnd: '2024-02-01' });
  assert.deepStrictEqual([clipped.startDate, clipped.endDate], ['2023-12-01', '2024-02-01']);
});

test('daily and weekly buckets are supported', () => {
  assert.deepStrictEqual(RorCalc.bucketsForGranularity('daily', '2026-09-01', '2026-09-03').map((b) => b.key), ['2026-09-01', '2026-09-02', '2026-09-03']);
  const weeks = RorCalc.bucketsForGranularity('weekly', '2026-09-02', '2026-09-14');
  assert.deepStrictEqual(weeks.map((b) => b.key), ['2026-08-31', '2026-09-07', '2026-09-14']);
});

test('financial year runs August through July', () => {
  const fy = RorModel.fyInfoForMonth('2026-08');
  assert.deepStrictEqual([fy.fyKey, fy.startPeriod, fy.endPeriod], ['FY27', '2026-08', '2027-07']);
});

test('latest partial day is labelled rather than treated as a complete period', () => {
  const agg = RorCalc.aggregate([rec('2026-09-24', 'shopify', 100, 3, 4, 'partial')], { channels: ['shopify'], startDate: '2026-09-24', endDate: '2026-09-24', nowDate: '2026-09-24' });
  assert.strictEqual(agg.status, 'partial');
});

test('missing and future periods remain distinct from zero', () => {
  const rows = [rec('2026-01-01', 'shopify', 0, 0, 0)];
  const missing = RorCalc.aggregate(rows, { channels: ['shopify'], startDate: '2026-02-01', endDate: '2026-02-28', nowDate: '2026-06-01' });
  const future = RorCalc.aggregate(rows, { channels: ['shopify'], startDate: '2027-01-01', endDate: '2027-01-31', nowDate: '2026-06-01' });
  assert.strictEqual(missing.status, 'no-data');
  assert.strictEqual(missing.revenue, null);
  assert.strictEqual(future.status, 'not-occurred');
});

test('channel contribution includes all three sources and totals to 100%', () => {
  const rows = [rec('2026-01-01', 'shopify', 700, 20, 22), rec('2026-01-01', 'noths', 200, 5, 6), rec('2026-01-01', 'etsy', 100, 10, 11)];
  const result = RorCalc.channelContribution(rows, { channels: RorModel.ACTIVE_CHANNELS, startDate: '2026-01-01', endDate: '2026-01-01', nowDate: '2026-06-01' });
  assert.strictEqual(result.channels.length, 3);
  assert.ok(Math.abs(result.channels.reduce((s, c) => s + c.pctOfRevenue, 0) - 1) < 1e-9);
});

test('previous equivalent range uses the same number of days', () => {
  const range = RorCalc.previousEquivalentRange('2026-09-01', '2026-09-24');
  assert.deepStrictEqual([range.startDate, range.endDate], ['2026-08-08', '2026-08-31']);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
