'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const H = require('../historical-source');
const C = require('../collect');
const money = (cents, code = 'GBP') => ({cents, currency: {iso_code: code, subunit_to_unit: 100}});
const component = (cents, code = 'GBP') => ({gross: money(cents, code), net: money(cents, code), vat: money(0, code)});
function order(id, placed_at, currency = 'GBP') {
  return {id, placed_at, state: 'accepted', order_total: money(1300), delivery_total: money(400), refund_total: money(0), items: [{listing_total_gross: money(1000)}], financials: {purchase_items: component(1000, currency), purchase_delivery: component(400, currency), purchase_discount: component(100, currency), listing_items: component(1000), listing_delivery: component(400), listing_discount: component(100), listing_total_with_discount: component(1300), commission: component(100)}};
}
test('Historical foreign purchase currency maps only verified native GBP components, including nonzero delivery', () => {
  const original = order(1, '2015-11-12T12:00:00Z', 'USD'), bytes = JSON.stringify(original), mapped = H.nativeGBP(original);
  assert.equal(mapped.currency, 'USD'); assert.equal(mapped.mapped, true);
  assert.equal(mapped.row.financials.purchase_delivery.gross.cents, 400);
  assert.equal(mapped.row.financials.purchase_items.gross.currency.iso_code, 'GBP');
  assert.equal(JSON.stringify(original), bytes); // Source remains immutable.
  assert.doesNotThrow(() => C.nothsOrder(mapped.row));
  assert.throws(() => C.nothsOrder(original), /unsupported NOTHS/); // Live validator remains strict.
  for (const defect of ['total', 'shipping', 'currency']) {
    const row = structuredClone(original);
    if (defect === 'total') row.order_total.cents++;
    if (defect === 'shipping') row.financials.listing_delivery.gross.cents++;
    if (defect === 'currency') row.financials.listing_items.gross.currency.iso_code = 'EUR';
    assert.throws(() => H.nativeGBP(row), /Historical/);
  }
});
test('Adjacent historical years resume on their shared boundary page without losing or duplicating an order', async () => {
  const dates = ['2015-12-28','2015-12-29','2015-12-30','2015-12-31','2016-01-01','2016-01-02','2016-01-03'], rows = dates.map((d,i) => order(i+1,d+'T12:00:00Z',i===4?'EUR':'GBP'));
  const calls = [], transport = async (url, options) => {
    const u = new URL(url), offset = Number(u.searchParams.get('offset')); calls.push(offset);
    assert.equal(options.method, 'GET'); assert.equal(u.searchParams.get('dir'), 'asc');
    return {ok: true, status: 200, json: async () => ({query: {total: rows.length}, data: rows.slice(offset,offset+3)})};
  };
  const reader = H.reader({env: {NOTHS_TOKEN: 'synthetic-fixture'}, transport, concurrency: 1});
  const first = await reader.capture({channel: 'noths', start: dates[0], end: dates[3]});
  assert.equal(first.resume_offset,3);
  const second = await reader.capture({channel: 'noths', start: dates[4], end: dates[5], initialOffset: first.resume_offset});
  assert.deepEqual([...first.capture.rows,...second.capture.rows].map(r=>r.id), [1,2,3,4,5,6]);
  const single = await reader.capture({channel: 'noths', start: dates[0], end: dates[5]});
  assert.deepEqual([...first.derived.daily,...second.derived.daily], single.derived.daily);
  assert.equal(second.audit.native_gbp_mapped_orders,1);
  assert.deepEqual(second.audit.purchase_currency_counts,{EUR:1});
  assert.doesNotMatch(JSON.stringify(second.audit),/synthetic-fixture|placed_at|receipt_id|buyer|email/);
});
test('Historical offsets reject invalid values before a source read', async () => {
  for (const initialOffset of [-1,1.5,NaN]) await assert.rejects(C.collect({channel:'noths',start:'2015-01-01T00:00:00Z',end:'2016-01-01T00:00:00Z',initialOffset,env:{NOTHS_TOKEN:'fixture'}}),/source offset/);
});

test('An unused legacy reference discrepancy is disclosed without changing any native GBP component or order total', () => {
 const row=order(1,'2015-11-20T12:00:00Z','AUD');row.financials.listing_total_with_discount.gross.cents=1200;
 const mapped=H.nativeGBP(row);assert.equal(mapped.reference_delta_pennies,100);assert.equal(mapped.row.order_total.cents,1300);assert.equal(mapped.row.financials.purchase_delivery.gross.cents,400);assert.equal(mapped.row.financials.listing_total_with_discount.gross.cents,1200);
});

test('A failed historical read is evicted so the same chunk can recover on retry', async () => {
 let calls=0;const reader=H.reader({env:{NOTHS_TOKEN:'fixture'},concurrency:1,transport:async()=>{calls++;return calls===1?{ok:false,status:500}:{ok:true,status:200,json:async()=>({query:{total:2},data:[order(1,'2015-11-04T12:00:00Z'),order(2,'2015-11-05T12:00:00Z')]})};}});
 const range={channel:'noths',start:'2015-11-04',end:'2015-11-04'};await assert.rejects(reader.capture(range),/HTTP 500/);const r=await reader.capture(range);assert.equal(r.capture.count,1);assert.equal(calls,2);
});

test('A one-penny component difference is accepted only with an exact native GBP invoice identity, preserving every recorded amount',()=>{
 const row=order(1,'2024-11-04T12:00:00Z','EUR');row.financials.listing_discount=component(101);row.financials.listing_subtotal=component(1401);
 const bytes=JSON.stringify(row),mapped=H.nativeGBP(row);assert.equal(mapped.component_delta_pennies,1);assert.equal(mapped.row.order_total.cents,1300);assert.equal(mapped.row.financials.purchase_items.gross.cents,1000);assert.equal(mapped.row.financials.purchase_delivery.gross.cents,400);assert.equal(mapped.row.financials.purchase_discount.gross.cents,101);assert.equal(JSON.stringify(row),bytes);
 for(const defect of ['larger','invoice','missing','currency']){const bad=structuredClone(row);if(defect==='larger')bad.financials.listing_items.gross.cents--;if(defect==='invoice')bad.financials.listing_subtotal.gross.cents++;if(defect==='missing')delete bad.financials.listing_subtotal;if(defect==='currency')bad.financials.listing_subtotal.gross.currency.iso_code='EUR';assert.throws(()=>H.nativeGBP(bad),/Historical/);}
});
