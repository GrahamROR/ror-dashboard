'use strict';
const test = require('node:test');
const a = require('node:assert/strict');
const R = require('../metrics');
const F = require('../../finance/contract');
const M = require('../../finance/management');
// Immutable, already-public snapshots: later daily publications cannot rewrite these expectations.
const shop = require('../../finance/staging/snapshots/9b80c1836fa0dee53a3ae3d56c9f0282e23e1305dff5a5d6b6a112d8772a0294.json');
const markets = require('../../finance/marketplaces/staging/snapshots/8daa36aff63949d58400b242f76ad827e33ab8a2de50c4bc195bc1caf82311c8.json');
const options = { shop, markets, start: '2026-10-01', end: '2026-10-31', channels: ['shopify', 'etsy', 'noths'] };
const build = extra => R.build({ ...options, ...extra });

test('October source components, counts and management totals agree without changing sources', () => {
  const before = JSON.stringify([shop, markets]);
  const report = build();
  a.equal(report.status, 'available');
  a.deepEqual(report.parts.map(p => [p.channel, p.pence, p.orders]), [['shopify', 1624379, 464], ['etsy', 175436, 73], ['noths', 498066, 182]]);
  a.equal(report.total.pence, 2297881);
  a.equal(report.total.orders, 719);
  a.equal(report.sourceStatus, 'provisional');
  a.equal(report.booksStatus, 'not-compared');
  a.equal(JSON.stringify([shop, markets]), before);
});

test('Exact rational identity distinguishes display rounding and native AOV', () => {
  const p = build({ channels: ['shopify'] }).parts[0];
  a.equal(p.identity.status, 'ties');
  a.equal(p.identity.reconstructedPence, 1624379);
  a.equal(p.identity.roundedDriftPence, 85);
  a.equal(p.identity.perOrder, 16243.79 / 464);
  a.equal(p.nativeAov, 32.53);
  a.notEqual(Math.round(p.nativeAov * p.orders * 100), p.pence);
});

test('FY26 exact ratio and a float-sensitive synthetic case never compare raw floats', () => {
  const p = build({ start: '2025-08-01', end: '2026-07-31', channels: ['shopify'] }).parts[0];
  a.equal(p.pence, 27167054);
  a.equal(p.orders, 7832);
  a.equal(p.identity.roundedDriftPence, 2154);
  const synthetic = R.identity(721391, 173);
  a.equal(synthetic.reconstructedPence, 721391);
  a.equal(synthetic.differencePence, 0);
});

test('Zero orders, refund-only periods and invalid counts never fabricate per-order values', () => {
  for (const pence of [0, -1450, 200]) {
    const result = R.identity(pence, 0);
    a.equal(result.status, 'zero-orders');
    a.equal(result.perOrder, null);
    a.equal(result.reconstructedPence, null);
  }
  for (const n of [null, -1, 1.5, Infinity]) a.equal(R.identity(100, n).status, 'unavailable');
  a.equal(R.identity(null, 2).perOrder, null);
  a.equal(R.identity(Number.MAX_SAFE_INTEGER + 1, 1).status, 'unavailable');
  a.equal(R.identity(-12345, 3).reconstructedPence, -12345);
});

test('Every covered day, calendar month and full FY agrees with existing source selectors', () => {
  for (const channels of [['shopify'], ['etsy'], ['noths'], options.channels]) {
    const periods = [['2025-08-01', '2026-07-31'], ['2026-08-01', '2026-10-31']];
    for (let d = '2026-10-01'; d <= '2026-10-31'; d = F.next(d)) periods.push([d, d]);
    for (let month = 8; month <= 10; month++) periods.push([`2026-${month}-01`, `2026-${month}-${month === 9 ? 30 : 31}`].map(s => s.replace('2026-8-', '2026-08-').replace('2026-9-', '2026-09-')));
    for (const [start, end] of periods) {
      const expected = M.select(shop, markets, channels, start, end, 'net_revenue');
      const actual = build({ channels, start, end });
      a.equal(actual.total.pence, expected.value);
      a.equal(actual.total.orders, expected.orders);
      if (actual.total.orders > 0) a.equal(actual.total.identity.reconstructedPence, expected.value);
      else a.equal(actual.total.identity.status, 'zero-orders');
    }
  }
});

test('Etsy keeps fiscal cumulative penny allocation rather than re-rounding the month', () => {
  const p = build({ channels: ['etsy'] }).parts[0];
  const rows = markets.channels.etsy.daily.filter(r => r.date >= '2026-10-01' && r.date <= '2026-10-31');
  const monthly = rows.reduce((n, r) => n + r.net_sales + r.shipping, 0);
  a.equal(p.pence, 175436);
  a.equal(Math.round(monthly * 5 / 6), 175437);
});

test('NOTHS retains the source-component residual and placed-order definition', () => {
  const p = build({ channels: ['noths'] }).parts[0];
  a.equal(p.components.find(r => r.key === 'residual').value, 548);
  a.equal(p.pence, 498066);
  a.match(p.countLabel, /placed-order cohort/);
  a.equal(p.merchandisePerOrder, null);
  a.equal(p.nativeAov, null);
});

test('A missing channel-day withholds combined money and source verification without substituting gross', () => {
  const clone = structuredClone(markets);
  clone.channels.etsy.daily = clone.channels.etsy.daily.filter(r => r.date !== '2026-10-15');
  const r = build({ markets: clone });
  a.equal(r.status, 'unavailable');
  a.equal(r.total.pence, null);
  a.equal(r.total.identity.perOrder, null);
  a.equal(r.sourceStatus, 'unavailable');
  a.equal(r.parts.find(p => p.channel === 'shopify').pence, 1624379);
});

test('Null source components cannot be promoted to source-verified by a non-null net total', () => {
  const clone = structuredClone(shop);
  clone.days.find(r => r.day === '2026-10-01').taxes = null;
  const r = build({ shop: clone, channels: ['shopify'] });
  a.equal(r.status, 'unavailable');
  a.equal(r.total.pence, null);
  a.equal(r.sourceStatus, 'unavailable');
});

test('Missing source, unsupported historical dates and future periods remain unavailable', () => {
  for (const o of [{ shop: null }, { markets: null }, { start: '2023-01-01', end: '2023-01-31' }, { start: '2029-01-01', end: '2029-01-31' }]) {
    const r = build(o);
    a.equal(r.total.pence, null);
    a.equal(r.total.identity.perOrder, null);
    a.equal(r.booksStatus, 'not-compared');
  }
});

test('Unknown/duplicate stores, malformed dates, source currency/timezone and schemas fail closed', () => {
  for (const o of [{ channels: [] }, { channels: ['shopify', 'shopify'] }, { channels: ['unknown'] }, { start: '2026-02-30' }, { start: '2026-11-01' }]) a.equal(build(o).status, 'error');
  for (const mutate of [s => s.store.currency = 'USD', s => s.store.timezone = 'UTC', s => s.schema = 'different']) {
    const clone = structuredClone(shop); mutate(clone);
    const r = build({ shop: clone });
    a.equal(r.status, 'error'); a.equal(r.sourceStatus, 'unavailable');
  }
});

test('Missing captured native interval never becomes an average or a derived substitute', () => {
  const clone = { ...shop, periods: [] };
  const p = build({ shop: clone, channels: ['shopify'] }).parts[0];
  a.equal(p.nativeAov, null);
  a.equal(p.nativeStatus, 'unavailable');
  a.equal(p.identity.status, 'ties');
});

test('Gross per order requires independently validated original shipping', () => {
  const clone = structuredClone(shop);
  clone.days.find(r => r.day === '2026-10-02').gross_shipping_validated = false;
  const p = build({ shop: clone, channels: ['shopify'] }).parts[0];
  a.equal(p.grossPerOrder, null);
  a.equal(p.pence, 1624379);
});

test('Native marketing accepts an exact source-matched full month and never prorates sessions', () => {
  const data = { years: { FY27: { monthly: [{ key: '2026-10', complete: true, orders: 464, revenue: 19103.54, netSales: 14853.73, sessions: 20000, conversionRate: .02 }] } } };
  a.equal(R.marketingPeriod(data, shop, '2026-10-01', '2026-10-31').sessions, 20000);
  a.equal(R.marketingPeriod(data, shop, '2026-10-02', '2026-10-31').sessions, null);
  data.years.FY27.monthly[0].orders++;
  a.equal(R.marketingPeriod(data, shop, '2026-10-01', '2026-10-31').status, 'unavailable');
});

test('Exact performance capture requires matching dates, timezone and native financial controls', () => {
  const native = F.select(shop, '2026-10-01', '2026-10-07');
  const data = { performance: { schema: 'shopify-performance-v1', timezone: 'Europe/London', last7: {
    status: 'complete', start: '2026-10-01', end: '2026-10-07', orders: native.orders, netSales: native.net_sales / 100, revenue: native.total_sales / 100,
    sessions: 1234, conversionRate: .03, repeatRate: .2,
  } } };
  a.equal(R.marketingPeriod(data, shop, '2026-10-01', '2026-10-07').sessions, 1234);
  data.performance.timezone = 'UTC';
  a.equal(R.marketingPeriod(data, shop, '2026-10-01', '2026-10-07').sessions, null);
});
