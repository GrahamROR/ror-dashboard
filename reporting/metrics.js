// Read-only reporting views. Existing dashboard calculations and source files are unchanged.
(function (root, factory) {
  if (typeof module === 'object' && module.exports)
    module.exports = factory(require('../finance/contract'), require('../finance/management'));
  else root.RorReportingMetrics = factory(root.ShopifyFinance, root.ManagementFinance);
})(typeof window === 'undefined' ? globalThis : window, function (F, M) {
  'use strict';

  const CHANNELS = ['shopify', 'noths', 'etsy'];
  const NAMES = { shopify: 'Shopify', etsy: 'Etsy', noths: 'NOTHS', all: 'All Stores' };
  const COUNT_LABELS = {
    shopify: 'Shopify eligible orders',
    etsy: 'Etsy source orders',
    noths: 'NOTHS placed-order cohort (provisional)',
    all: 'Combined source orders (includes provisional NOTHS cohort)',
  };
  const safeMoney = value => Number.isSafeInteger(value);
  const safeCount = value => Number.isSafeInteger(value) && value >= 0;

  // Keep the exact rational pair authoritative, even when the displayed decimal repeats.
  // This identity checks arithmetic, not source correctness or accounting reconciliation.
  function identity(numeratorPence, orders) {
    const empty = { numeratorPence, orders, perOrder: null, reconstructedPence: null,
      differencePence: null, roundedPerOrderPence: null, roundedDriftPence: null };
    if (!safeMoney(numeratorPence) || !safeCount(orders)) return { ...empty, status: 'unavailable' };
    if (orders === 0) return { ...empty, status: 'zero-orders' };
    const reconstructedPence = Number(BigInt(orders) * BigInt(numeratorPence) / BigInt(orders));
    const roundedPerOrderPence = Math.round(numeratorPence / orders);
    const roundedProduct = roundedPerOrderPence * orders;
    return { ...empty, status: 'ties', perOrder: numeratorPence / 100 / orders,
      reconstructedPence, differencePence: reconstructedPence - numeratorPence,
      roundedPerOrderPence, roundedDriftPence: safeMoney(roundedProduct) ? roundedProduct - numeratorPence : null };
  }

  function sourceRows(snapshot, channel, start, end) {
    return (snapshot?.channels?.[channel]?.daily || []).filter(r => r.date >= start && r.date <= end);
  }

  function sum(rows, key) {
    if (!rows.length || !rows.every(r => safeMoney(r[key]))) return null;
    const value = rows.reduce((n, r) => n + r[key], 0);
    return safeMoney(value) ? value : null;
  }

  function checkSource(snapshot, channel) {
    if (!snapshot) return;
    const currency = channel === 'shopify' ? snapshot.store?.currency : snapshot.currency;
    const timezone = channel === 'shopify' ? snapshot.store?.timezone : snapshot.timezone;
    if (currency !== 'GBP' || timezone !== 'Europe/London') throw Error('Source currency or reporting timezone does not match.');
    if (snapshot.schema !== (channel === 'shopify' ? F.VERSION : 'marketplace-sales-v1'))
      throw Error('Source schema is unavailable.');
  }

  function components(channel, shop, markets, start, end, available) {
    if (!available) return [];
    const row = (key, label, value, definition) => ({ key, label, value, definition });
    if (channel === 'shopify') {
      const s = F.select(shop, start, end);
      return [
        row('gross_sales', 'Gross merchandise sales', s.gross_sales, F.DEFINITIONS.gross_sales),
        row('discounts', 'Discounts (signed)', s.discounts, F.DEFINITIONS.discounts),
        row('sales_reversals', 'Sales reversals (signed)', s.sales_reversals, F.DEFINITIONS.sales_reversals),
        row('net_sales', 'Net merchandise sales', s.net_sales, F.DEFINITIONS.net_sales),
        row('shipping', 'Net shipping revenue', s.shipping_charges, F.DEFINITIONS.shipping_charges),
        row('management', 'Management Net Sales', s.net_sales + s.shipping_charges, M.DEFINITIONS.net_revenue),
        row('taxes', 'Source-reported taxes', s.taxes, F.DEFINITIONS.taxes),
        row('total_sales', 'Shopify total sales', s.total_sales, F.DEFINITIONS.total_sales),
        row('residual', 'Total-sales component residual', s.component_residual,
          'Total sales minus net merchandise, net shipping and taxes. Any difference remains unexplained.'),
      ];
    }
    const rows = sourceRows(markets, channel, start, end);
    if (channel === 'etsy') return [
      row('gross_sales', 'Original merchandise value', sum(rows, 'gross_sales'), 'Native Etsy merchandise before discounts.'),
      row('discounts', 'Discount amount', sum(rows, 'discounts'), 'Native discount magnitude; deducted once.'),
      row('net_sales', 'Stats merchandise sales', sum(rows, 'net_sales'), 'Native Stats-compatible merchandise measure; source tax treatment retained.'),
      row('shipping', 'Source shipping', sum(rows, 'shipping'), 'Native shipping component.'),
      row('taxes', 'Source-reported tax', sum(rows, 'tax'), 'May include marketplace-remitted tax. Not deducted again by the management formula.'),
      row('total_sales', 'Native receipt total', sum(rows, 'total_sales'), 'Source receipt total; distinct from management sales.'),
    ];
    const gross = sum(rows, 'gross_sales'), shipping = sum(rows, 'shipping');
    const discounts = sum(rows, 'source_discounts'), customer = sum(rows, 'customer_total');
    return [
      row('gross_sales', 'Source merchandise gross', gross, 'Original NOTHS source component.'),
      row('shipping', 'Source delivery', shipping, 'Original NOTHS delivery component.'),
      row('discounts', 'Source discount amount', discounts, 'Original source discount magnitude; funding classification remains provisional.'),
      row('total_sales', 'Original customer order total', customer, 'Placed-order cohort, without inferred cumulative refund deduction.'),
      row('residual', 'Source-component residual', [gross, shipping, discounts, customer].every(safeMoney) ? customer - gross - shipping + discounts : null,
        'Customer total minus merchandise plus delivery less discounts. Retained as a source difference; never used as a balancing adjustment.'),
    ];
  }

  function perOrder(pence, count) {
    return safeMoney(pence) && safeCount(count) && count > 0 ? pence / 100 / count : null;
  }

  function channelReport(channel, options) {
    const { shop, markets, start, end } = options;
    checkSource(channel === 'shopify' ? shop : markets, channel);
    const result = M.select(shop, markets, [channel], start, end, 'net_revenue');
    const valid = result.status === 'actual' && result.parts.every(p => p.status === 'actual' && ['source-verified', 'provisional'].includes(p.confidence)) &&
      safeMoney(result.value) && safeCount(result.orders);
    const pence = valid ? result.value : null;
    const count = safeCount(result.orders) ? result.orders : null;
    const native = channel === 'shopify' && shop ? F.select(shop, start, end) : null;
    const breakdown = components(channel, shop, markets, start, end, valid);
    const get = key => breakdown.find(r => r.key === key)?.value ?? null;
    const gross = channel === 'shopify' && valid ? M.shopify(shop, start, end, 'gross_revenue').value : null;
    return {
      channel, label: NAMES[channel], countLabel: COUNT_LABELS[channel], pence, orders: count,
      available: valid, confidence: valid ? result.confidence : 'unavailable',
      warning: result.warning || '', identity: identity(pence, count), components: breakdown,
      sourceId: channel === 'shopify' ? shop?.id : markets?.channels?.[channel]?.source_sha256,
      through: channel === 'shopify' ? shop?.coverage?.end : markets?.channels?.[channel]?.daily?.at(-1)?.date,
      nativeAov: valid && channel === 'shopify' && Number.isFinite(native.average_order_value) ? native.average_order_value : null,
      merchandisePerOrder: perOrder(get('net_sales'), count),
      totalPerOrder: perOrder(get('total_sales'), count), grossPerOrder: perOrder(gross, count),
      nativeStatus: channel === 'shopify' && valid && Number.isFinite(native.average_order_value) ? 'captured' : 'unavailable',
    };
  }

  // Marketing counts/rates are shown only for an exact, source-matched capture.
  // Never prorate monthly sessions or average rates for a custom interval.
  function marketingPeriod(data, shop, start, end) {
    const unavailable = { status: 'unavailable', sessions: null, conversionRate: null, repeatRate: null };
    if (!data || !shop) return unavailable;
    const native = F.select(shop, start, end);
    if (native.status !== 'actual') return unavailable;
    const close = (pounds, pence) => Number.isFinite(pounds) && Math.round(pounds * 100) === pence;
    const matches = row => row && row.orders === native.orders && close(row.netSales, native.net_sales) && close(row.revenue, native.total_sales);
    let capture = null;
    if (data.performance?.schema === 'shopify-performance-v1' && data.performance.timezone === 'Europe/London')
      capture = Object.values(data.performance).find(row => row && typeof row === 'object' && row.status === 'complete' && row.start === start && row.end === end && matches(row));
    if (!capture && start.endsWith('-01')) {
      const last = new Date(Date.UTC(+start.slice(0, 4), +start.slice(5, 7), 0)).toISOString().slice(0, 10);
      if (end === last) capture = Object.values(data.years || {}).flatMap(y => y.monthly || [])
        .find(row => row.key === start.slice(0, 7) && row.complete === true && matches(row));
    }
    if (!capture) return unavailable;
    const rate = value => Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
    return { status: 'matched', sessions: safeCount(capture.sessions) ? capture.sessions : null,
      conversionRate: rate(capture.shopifyConversionRate ?? capture.conversionRate),
      repeatRate: rate(capture.repeatRate), source: 'Shopify capture for this exact period' };
  }

  function build(options) {
    try {
      const { start, end, channels } = options;
      F.day(start); F.day(end);
      if (start > end || !Array.isArray(channels) || !channels.length ||
          new Set(channels).size !== channels.length || channels.some(c => !CHANNELS.includes(c)))
        throw Error('Choose a valid reporting period and store.');
      const parts = channels.map(channel => channelReport(channel, options));
      const complete = parts.every(p => p.available);
      const value = complete ? parts.reduce((n, p) => n + p.pence, 0) : null;
      const counts = parts.every(p => safeCount(p.orders)) ? parts.reduce((n, p) => n + p.orders, 0) : null;
      const pence = safeMoney(value) ? value : null, orders = safeCount(counts) ? counts : null;
      return { status: complete && pence != null && orders != null ? 'available' : 'unavailable', start, end, parts,
        total: { pence, orders, identity: identity(pence, orders), countLabel: channels.length === 1 ? COUNT_LABELS[channels[0]] : COUNT_LABELS.all },
        sourceStatus: complete && pence != null && orders != null ? parts.some(p => p.confidence === 'provisional') ? 'provisional' : 'source-verified' : 'unavailable',
        booksStatus: 'not-compared',
        marketing: channels.length === 1 && channels[0] === 'shopify' ? marketingPeriod(options.marketing, options.shop, start, end) : null };
    } catch {
      return { status: 'error', error: 'Report unavailable. Source data or the selected reporting context could not be validated.',
        parts: [], total: { pence: null, orders: null, identity: identity(null, null) }, sourceStatus: 'unavailable', booksStatus: 'not-compared' };
    }
  }

  return { CHANNELS, NAMES, COUNT_LABELS, identity, marketingPeriod, build };
});
