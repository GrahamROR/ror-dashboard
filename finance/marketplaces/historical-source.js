'use strict';
const crypto = require('node:crypto');
const C = require('./collect');
const A = require('./api-normalize');
const Source = require('./api-source');
const F = require('../contract');
const MAPPING = 'native-gbp-listing-components-v2';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function gbp(value) {
  if (value?.currency?.iso_code !== 'GBP' || value.currency.subunit_to_unit !== 100 || !Number.isSafeInteger(value.cents)) throw Error('Historical native GBP evidence missing');
  return value.cents;
}
function component(value) {
  for (const key of ['gross', 'net', 'vat']) gbp(value?.[key]);
  return value;
}
function nativeGBP(row) {
  const currency = row.financials?.purchase_items?.gross?.currency?.iso_code;
  if (currency === 'GBP') return {row, mapped: false};
  if (!/^[A-Z]{3}$/.test(currency || '')) throw Error('Historical purchase currency missing');
  const f = row.financials, items = component(f?.listing_items), delivery = component(f?.listing_delivery), discount = component(f?.listing_discount);
  const total = gbp(row.order_total);
  const referenceDelta = total - gbp(f?.listing_total_with_discount?.gross);
  const componentDelta = total - (gbp(items.gross) - gbp(discount.gross) + gbp(delivery.gross));
  if (componentDelta !== 0 && (Math.abs(componentDelta) !== 1 || gbp(f?.listing_subtotal?.gross) - gbp(discount.gross) !== total)) throw Error('Historical GBP component identity mismatch');
  return {row: {...row, financials: {...f, purchase_items: items, purchase_delivery: delivery, purchase_discount: discount}}, mapped: true, currency, reference_delta_pennies: referenceDelta, component_delta_pennies: componentDelta};
}
// Read-only historical transport. The live collector/source never uses this adapter.
function reader({env, transport = fetch, concurrency = 3, timeoutMs = 90000} = {}) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) throw Error('Invalid historical source concurrency');
  const cache = new Map(), waiting = []; let active = 0;
  async function acquire() { if (active < concurrency) active++; else await new Promise(resolve => waiting.push(resolve)); }
  function release() { if (waiting.length) waiting.shift()(); else active--; }
  const fetcher = Source.retrying((url, options) => transport(url, {...options, signal: AbortSignal.timeout(timeoutMs)}));
  function request(url, options) {
    const key = String(url);
    if (!cache.has(key)) cache.set(key, (async () => {
      await acquire();
      try {
        const response = await fetcher(url, options);
        if (!response.ok) throw Error('Historical source read failed HTTP ' + response.status);
        return await response.json();
      } finally { release(); }
    })().then(body => ({body}), error => ({error})));
    return cache.get(key);
  }
  return {
    clear() { cache.clear(); },
    async capture({channel, start, end, initialOffset = 0, maxPages = 700, credentials = env}) {
      let resumeOffset = initialOffset, sourceError = null;
      const audit = {mapping_policy: MAPPING, native_gbp_mapped_orders: 0, native_component_rounding_orders: 0, native_component_delta_pennies: 0, listing_reference_difference_orders: 0, listing_reference_delta_pennies: 0, purchase_currency_counts: {}, page_response_sha256: []};
      const lower = Date.parse(A.midnight(start)), upper = Date.parse(A.midnight(F.next(end)));
      const scopedFetch = async (url, options) => {
        try {
        const u = new URL(url), offset = Number(u.searchParams.get('offset'));
        if (channel === 'noths') {
          for (let i = 0; i < concurrency; i++) {
            const next = new URL(u); next.searchParams.set('offset', offset + i * 250);
            request(next, options);
          }
          // Keep the boundary page and a small lookahead, not an in-memory decade of raw rows.
          for (const key of cache.keys()) if (Number(new URL(key).searchParams.get('offset')) < offset - 500) cache.delete(key);
        }
        const result = await request(u, options);
        if (result.error) { cache.delete(String(u)); throw result.error; }
        const body = result.body;
        audit.page_response_sha256.push(hash(body));
        let view = body;
        if (channel === 'noths') {
          if (!Array.isArray(body.data)) throw Error('Historical source page missing');
          const crosses = body.data.some(row => Date.parse(row.placed_at) >= upper);
          resumeOffset = crosses ? offset : offset + body.data.length;
          view = {...body, data: body.data.map(row => {
            const t = Date.parse(row.placed_at);
            if (t < lower || t >= upper) return row;
            const mapped = nativeGBP(row);
            if (mapped.mapped) {
              audit.native_gbp_mapped_orders++;
              if (mapped.component_delta_pennies !== 0) { audit.native_component_rounding_orders++; audit.native_component_delta_pennies += mapped.component_delta_pennies; }
              if (mapped.reference_delta_pennies !== 0) { audit.listing_reference_difference_orders++; audit.listing_reference_delta_pennies += mapped.reference_delta_pennies; }
              audit.purchase_currency_counts[mapped.currency] = (audit.purchase_currency_counts[mapped.currency] || 0) + 1;
            }
            return mapped.row;
          })};
        }
        if (channel === 'etsy') cache.delete(String(u));
        return {ok: true, status: 200, json: async () => view};
        } catch (error) { sourceError = error; throw error; }
      };
      let capture;
      try { capture = await C.collect({channel, start: A.midnight(start), end: A.midnight(F.next(end)), env: credentials, fetcher: scopedFetch, dir: 'asc', initialOffset, maxPages}); } catch (error) { throw sourceError || error; }
      const derived = A.derive(capture, start, end);
      return {capture, derived, initial_offset: initialOffset, resume_offset: resumeOffset, audit};
    },
  };
}
module.exports = {MAPPING, gbp, nativeGBP, reader, hash};
