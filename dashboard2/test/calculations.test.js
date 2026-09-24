// Plain-Node unit tests for dashboard2/calculations.js — no test
// framework dependency, matches the rest of this repo's scripts.
// Run: node dashboard2/test/calculations.test.js

const assert = require('assert');
const path = require('path');

const RorModel = require('../data-model.js');
const RorCalc = require('../calculations.js');
const demoData = require('../demo-data.json');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  - ${name}`);
    console.log('       ' + e.message);
  }
}

function rec(period, channel, revenue, orders, completeness) {
  return { period, channel, revenue, orders, currency: 'GBP', source: 'test', completeness: completeness || 'complete' };
}

// ── weighted AOV ─────────────────────────────────────────────
test('AOV is weighted by orders, not averaged across channels', () => {
  // shopify: 1000 rev / 10 orders = AOV 100
  // etsy:    90 rev / 30 orders  = AOV 3
  // naive average of AOVs = 51.5 — that would be WRONG.
  // correct weighted AOV = (1000+90) / (10+30) = 27.25
  const records = [
    rec('2026-01', 'shopify', 1000, 10),
    rec('2026-01', 'etsy', 90, 30),
  ];
  const agg = RorCalc.aggregate(records, { channels: ['shopify', 'etsy'], startPeriod: '2026-01', endPeriod: '2026-01', nowPeriod: '2026-06' });
  assert.strictEqual(agg.revenue, 1090);
  assert.strictEqual(agg.orders, 40);
  assert.strictEqual(agg.aov, 1090 / 40);
  assert.notStrictEqual(Math.round(agg.aov * 100) / 100, 51.5);
});

// ── MoM ──────────────────────────────────────────────────────
test('MoM percent and absolute change are computed correctly', () => {
  const records = [
    rec('2026-01', 'shopify', 10000, 300),
    rec('2026-02', 'shopify', 11000, 320),
  ];
  const jan = RorCalc.aggregate(records, { channels: ['shopify'], startPeriod: '2026-01', endPeriod: '2026-01', nowPeriod: '2026-06' });
  const feb = RorCalc.aggregate(records, { channels: ['shopify'], startPeriod: '2026-02', endPeriod: '2026-02', nowPeriod: '2026-06' });
  const cmp = RorCalc.compareAggregates(feb, jan, 'revenue');
  assert.strictEqual(cmp.status, 'ok');
  assert.strictEqual(cmp.absoluteChange, 1000);
  assert.ok(Math.abs(cmp.percentChange - 10) < 1e-9);
});

// ── YoY ──────────────────────────────────────────────────────
test('YoY compares the same calendar month a year apart', () => {
  const records = [
    rec('2025-09', 'shopify', 20000, 600),
    rec('2026-09', 'shopify', 24000, 650),
  ];
  const thisYear = RorCalc.aggregate(records, { channels: ['shopify'], startPeriod: '2026-09', endPeriod: '2026-09', nowPeriod: '2026-09' });
  const lastYear = RorCalc.aggregate(records, { channels: ['shopify'], startPeriod: '2025-09', endPeriod: '2025-09', nowPeriod: '2026-09' });
  const cmp = RorCalc.compareAggregates(thisYear, lastYear, 'revenue');
  assert.strictEqual(cmp.absoluteChange, 4000);
  assert.ok(Math.abs(cmp.percentChange - 20) < 1e-9);
});

// ── financial year boundaries ───────────────────────────────
test('financial year runs Aug -> Jul and is named after its end year', () => {
  const fy27start = RorModel.fyInfoForMonth('2026-08');
  assert.strictEqual(fy27start.fyKey, 'FY27');
  assert.strictEqual(fy27start.startPeriod, '2026-08');
  assert.strictEqual(fy27start.endPeriod, '2027-07');

  const fy26end = RorModel.fyInfoForMonth('2026-07');
  assert.strictEqual(fy26end.fyKey, 'FY26');
  assert.strictEqual(fy26end.endPeriod, '2026-07');
});

test('resolveDateRange currentFY / previousFY line up on the Aug boundary', () => {
  const now = new Date(2026, 8, 24); // 24 Sep 2026 -> FY27
  const cur = RorCalc.resolveDateRange('currentFY', { nowDate: now });
  assert.strictEqual(cur.startPeriod, '2026-08');
  assert.strictEqual(cur.endPeriod, '2026-09');

  const prev = RorCalc.resolveDateRange('previousFY', { nowDate: now });
  assert.strictEqual(prev.startPeriod, '2025-08');
  assert.strictEqual(prev.endPeriod, '2026-07');
});

// ── partial / incomplete month ──────────────────────────────
test('a month-to-date (partial) period is flagged, not silently compared as complete', () => {
  const records = [
    rec('2026-08', 'shopify', 20000, 600, 'complete'),
    rec('2026-09', 'shopify', 9000, 250, 'partial'),
  ];
  const sep = RorCalc.aggregate(records, { channels: ['shopify'], startPeriod: '2026-09', endPeriod: '2026-09', nowPeriod: '2026-09' });
  assert.strictEqual(sep.status, 'partial');
  const aug = RorCalc.aggregate(records, { channels: ['shopify'], startPeriod: '2026-08', endPeriod: '2026-08', nowPeriod: '2026-09' });
  const cmp = RorCalc.compareAggregates(sep, aug, 'revenue');
  assert.strictEqual(cmp.status, 'incomplete-current');
  assert.ok(cmp.note.toLowerCase().includes('in progress'));
});

// ── missing data vs genuine zero vs not-occurred ────────────
test('missing source data never silently becomes zero', () => {
  const records = [rec('2026-01', 'shopify', 5000, 100)];
  const agg = RorCalc.aggregate(records, { channels: ['shopify'], startPeriod: '2026-03', endPeriod: '2026-03', nowPeriod: '2026-06' });
  assert.strictEqual(agg.status, 'no-data');
  assert.strictEqual(agg.revenue, null);
  assert.notStrictEqual(agg.revenue, 0);
});

test('a future period is "not-occurred", never fabricated', () => {
  const records = [rec('2026-01', 'shopify', 5000, 100)];
  const agg = RorCalc.aggregate(records, { channels: ['shopify'], startPeriod: '2027-01', endPeriod: '2027-01', nowPeriod: '2026-06' });
  assert.strictEqual(agg.status, 'not-occurred');
  assert.strictEqual(agg.revenue, null);
});

// ── division by zero ────────────────────────────────────────
test('a zero-revenue prior period yields a labelled result, never Infinity/NaN', () => {
  const records = [
    rec('2026-01', 'shopify', 0, 0),
    rec('2026-02', 'shopify', 5000, 150),
  ];
  const jan = RorCalc.aggregate(records, { channels: ['shopify'], startPeriod: '2026-01', endPeriod: '2026-01', nowPeriod: '2026-06' });
  const feb = RorCalc.aggregate(records, { channels: ['shopify'], startPeriod: '2026-02', endPeriod: '2026-02', nowPeriod: '2026-06' });
  const cmp = RorCalc.compareAggregates(feb, jan, 'revenue');
  assert.strictEqual(cmp.status, 'zero-denominator');
  assert.strictEqual(cmp.percentChange, null);
  assert.ok(!Number.isNaN(cmp.absoluteChange) && Number.isFinite(cmp.absoluteChange));
});

// ── granularity buckets ──────────────────────────────────────
test('quarterly buckets align to calendar quarters and step correctly', () => {
  const buckets = RorCalc.bucketsForGranularity('quarterly', '2026-02', '2026-08');
  assert.deepStrictEqual(buckets.map(b => b.key), ['2026-Q1', '2026-Q2', '2026-Q3']);
  assert.strictEqual(buckets[0].startPeriod, '2026-01');
  assert.strictEqual(buckets[0].endPeriod, '2026-03');
});

test('previousBucket and yearEarlierBucket agree for financial-year granularity', () => {
  const buckets = RorCalc.bucketsForGranularity('financial-year', '2026-08', '2026-08');
  const b = buckets[0];
  assert.strictEqual(b.key, 'FY27');
  const prev = RorCalc.previousBucket(b);
  const yoy = RorCalc.yearEarlierBucket(b);
  assert.strictEqual(prev.key, yoy.key);
  assert.strictEqual(prev.key, 'FY26');
});

// ── comparison table totals use weighted AOV ────────────────
test('comparison table totals row uses weighted AOV, not summed/averaged per-bucket AOV', () => {
  const records = [
    rec('2026-01', 'shopify', 1000, 100), // AOV 10
    rec('2026-02', 'shopify', 3000, 100), // AOV 30
  ];
  const table = RorCalc.buildComparisonTable(records, {
    channels: ['shopify'], granularity: 'monthly', fromPeriod: '2026-01', toPeriod: '2026-02', metric: 'aov', nowPeriod: '2026-06',
  });
  // naive average of (10, 30) = 20 — wrong. correct = 4000 total rev / 200 total orders = 20 too by
  // coincidence here, so use an asymmetric case below instead.
  const records2 = [
    rec('2026-01', 'shopify', 1000, 10),  // AOV 100
    rec('2026-02', 'shopify', 90, 30),    // AOV 3
  ];
  const table2 = RorCalc.buildComparisonTable(records2, {
    channels: ['shopify'], granularity: 'financial-year', fromPeriod: '2026-01', toPeriod: '2026-02', metric: 'aov', nowPeriod: '2026-06',
  });
  assert.strictEqual(table2.totals.aov, 1090 / 40);
  assert.notStrictEqual(table2.totals.aov, (100 + 3) / 2);
});

// ── channel contribution ────────────────────────────────────
test('channel contribution percentages sum to ~100% and use the same revenue figures as the totals', () => {
  const records = [
    rec('2026-01', 'shopify', 700, 20),
    rec('2026-01', 'noths', 200, 5),
    rec('2026-01', 'etsy', 100, 10),
  ];
  const contrib = RorCalc.channelContribution(records, {
    channels: ['shopify', 'noths', 'etsy'], startPeriod: '2026-01', endPeriod: '2026-01', nowPeriod: '2026-06',
  });
  const sumPct = contrib.channels.reduce((s, c) => s + c.pctOfRevenue, 0);
  assert.ok(Math.abs(sumPct - 1) < 1e-9);
  assert.strictEqual(contrib.totals.revenue, 1000);
});

test('legacy (closed) channels are excluded unless explicitly requested', () => {
  const activeOnly = RorCalc.aggregate(demoData.records, {
    channels: RorModel.ACTIVE_CHANNELS, startPeriod: '2018-01', endPeriod: '2018-12', nowPeriod: '2026-09',
  });
  const legacyIncluded = RorCalc.aggregate(demoData.records, {
    channels: RorModel.ALL_CHANNELS, startPeriod: '2018-01', endPeriod: '2018-12', nowPeriod: '2026-09',
  });
  // Active channels (shopify/noths/etsy) don't start until 2021-08 in the
  // demo fixture, so 2018 should have no data for the active-only view...
  assert.strictEqual(activeOnly.status, 'no-data');
  // ...but legacy channels (silkfred/asos) were running in 2018, so the
  // all-channels view must find real records (status won't be 'complete'
  // since shopify/noths/etsy simply didn't exist yet in 2018 — that's
  // correctly reported as incomplete-data, not masked as zero or missing).
  assert.notStrictEqual(legacyIncluded.status, 'no-data');
  assert.ok(legacyIncluded.revenue > 0);
});

// ── arbitrary-range shifts for KPI-card comparisons ─────────
test('previousEquivalentRange shifts back by the range\'s own length', () => {
  const r = RorCalc.previousEquivalentRange('2026-01', '2026-03'); // 3-month window
  assert.strictEqual(r.startPeriod, '2025-10');
  assert.strictEqual(r.endPeriod, '2025-12');
});

test('yearEarlierRange shifts both ends back exactly 12 months', () => {
  const r = RorCalc.yearEarlierRange('2026-08', '2026-09');
  assert.strictEqual(r.startPeriod, '2025-08');
  assert.strictEqual(r.endPeriod, '2025-09');
});

// ── daily presets are honestly unsupported ──────────────────
test('daily/short-window presets report unsupported rather than fabricating a figure', () => {
  for (const key of ['today', 'yesterday', 'last7', 'last30']) {
    const r = RorCalc.resolveDateRange(key, { nowDate: new Date(2026, 8, 24) });
    assert.strictEqual(r.unsupported, true, `${key} should be unsupported`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
