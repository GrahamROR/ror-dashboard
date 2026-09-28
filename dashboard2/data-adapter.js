// The browser reads a privacy-safe, daily aggregate exported from production D1.
(function (root) {

function normalizeRecord(r) {
  return {
    date: r.date, period: r.date, channel: r.channel,
    revenue: Number(r.revenue), orders: Number(r.orders), units: Number(r.units),
    currency: r.currency || 'GBP', source: r.source || 'sales_history_items',
    completeness: r.completeness || 'complete',
  };
}

function createProductionAdapter(url) {
  url = url || 'dashboard2/sales-data.json';
  let pending = null;
  function load() {
    if (!pending) {
      pending = fetch(url + '?t=' + Date.now())
        .then((r) => { if (!r.ok) throw new Error('production sales export not found: ' + url); return r.json(); })
        .then((json) => ({ meta: json.meta, records: (json.records || []).map(normalizeRecord) }));
    }
    return pending;
  }
  return { load, kind: 'production-d1-export' };
}

root.RorDataAdapter = { createProductionAdapter, normalizeRecord };

})(typeof window !== 'undefined' ? window : globalThis);
