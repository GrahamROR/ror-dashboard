'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const S = require('../store'), MP = require('../contract'), C = require('../../../dashboard2/calculations');
const candidate = S.read(path.join(__dirname, '../candidates/etsy-aug-sep-2026'));
const prior = S.read(path.join(__dirname, '../staging'));
const stats = require('../../../docs/pr3/current-year/aug-sep-validation/independent-stats-controls.json');
const legacy = require('../../../dashboard2/sales-data.json').records;
function records(basis) { return MP.attach([...legacy], candidate, basis); }
for (const control of stats.months) test('Real Etsy exports independently reconcile ' + control.month + ' throughout original ROR components', () => {
  const month = candidate.channels.etsy.months.find(m => m.month === control.month);
  assert.equal(month.net_sales, Math.round(Number(control.revenue_gbp) * 100));
  assert.equal(month.orders, control.orders);
  assert.equal(month.gross_sales - month.discounts, month.net_sales);
  assert.equal(month.audit.refunds, 0);
  for (const basis of ['net_sales', 'gross_sales', 'total_sales']) {
    const r = records(basis), opts = {channels:['etsy'], startDate:control.start, endDate:control.end_inclusive, nowDate:'2026-10-12'};
    const agg = C.aggregate(r, opts);
    assert.equal(agg.revenue, month[basis] / 100);
    assert.equal(agg.orders, control.orders);
    assert.equal(agg.aov, agg.revenue / agg.orders);
    assert.equal(agg.status, 'complete');
    const table = C.buildComparisonTable(r, {...opts, fromPeriod:opts.startDate, toPeriod:opts.endDate, granularity:'monthly', metric:'revenue'});
    const chart = C.buildSeries(r, {...opts, fromPeriod:opts.startDate, toPeriod:opts.endDate, granularity:'monthly', metric:'revenue', seriesMode:'combined'});
    assert.equal(table.totals.revenue, agg.revenue);
    assert.equal(chart.series[0].points[0].value, agg.revenue);
    assert.equal(C.channelContribution(r, opts).channels[0].revenue, agg.revenue);
  }
});
test('Real new-month candidate retains FY26 exactly and never estimates October or replaces legacy All Stores', () => {
  assert.deepEqual(candidate.channels.etsy.months.filter(m => m.month < '2026-08'), prior.channels.etsy.months);
  assert.deepEqual(candidate.channels.etsy.daily.filter(m => m.date < '2026-08-01'), prior.channels.etsy.daily);
  for(const key of ['currentFY', 'thisMonth', 'last30', 'last7']) {
    const range = C.resolveDateRange(key, {nowDate:new Date('2026-10-12T12:00:00Z')});
    const opts = {...range,channels:['etsy']};
    const net = C.aggregate(records('net_sales'),opts);
    assert.equal(net.revenue,null); assert.equal(net.orders,null); assert.equal(net.aov,null);
    const old = C.aggregate(legacy,opts), gross = C.aggregate(records('legacy_gross'),opts);
    for(const field of ['revenue','orders','aov','units']) assert.equal(gross[field],old[field]);
    const all = {...opts,channels:['shopify','etsy','noths']};
    assert.deepEqual(C.aggregate(records('net_sales'),all),C.aggregate(legacy,all));
  }
});
