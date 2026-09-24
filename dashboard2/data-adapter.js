// ============================================================
// ROR SALES DASHBOARD 2 — data adapter
// ------------------------------------------------------------
// The ONLY place that knows where sales records come from. Every
// adapter exposes the same shape: `load()` -> Promise<{ meta, records }>
// where each record matches the canonical shape in data-model.js.
//
// Today: dashboard2/demo-data.json (fictional fixture, see its own
// meta.label). Phase 2: swap createDemoAdapter() for a
// createStockHubAdapter() that calls a read-only, authenticated
// StockHub v2 reporting endpoint and maps its response into the same
// { meta, records } shape below — nothing in calculations.js or
// ror-sales-app.js needs to change for that swap.
// ============================================================

(function (root) {

function normalizeRecord(r) {
  return {
    period: r.period,
    channel: r.channel,
    revenue: Number(r.revenue),
    orders: Number(r.orders),
    currency: r.currency || 'GBP',
    source: r.source || 'unknown',
    completeness: r.completeness || 'complete',
  };
}

// Demo/fixture adapter — reads the statically generated JSON file.
function createDemoAdapter(url) {
  url = url || 'dashboard2/demo-data.json';
  let pending = null;
  function load() {
    if (!pending) {
      pending = fetch(url + '?t=' + Date.now())
        .then((r) => { if (!r.ok) throw new Error('demo data not found: ' + url); return r.json(); })
        .then((json) => ({
          meta: json.meta,
          records: (json.records || []).map(normalizeRecord),
        }));
    }
    return pending;
  }
  return { load, kind: 'demo-fixture' };
}

root.RorDataAdapter = { createDemoAdapter, normalizeRecord };

})(typeof window !== 'undefined' ? window : globalThis);
