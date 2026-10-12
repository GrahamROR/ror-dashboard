// Source-specific marketplace definitions; shared penny/date primitives from P2.
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("../contract.js"));
  else root.MarketplaceFinance = factory(root.ShopifyFinance);
})(typeof window === "undefined" ? globalThis : window, function (F) {
  "use strict";
  const VERSION = "marketplace-sales-v1";
  const LABELS = {
    net_sales: "Etsy Stats merchandise sales",
    gross_sales: "Etsy original merchandise value",
    total_sales: "Etsy Sold Orders total",
  };
  const DEFINITIONS = {
    net_sales:
      "Etsy Sold Orders Order Value minus Discount Amount. Verified against supplied FY26 Stats controls. Fully refunded payments absent from Sold Orders are excluded; partial refunds are not subtracted again. Preserves source tax treatment; not asserted VAT-exclusive accounting turnover.",
    gross_sales:
      "Original merchandise Order Value for Etsy Sold Orders, before discounts; excludes fully refunded payment-only records. Different from StockHub imported gross.",
    total_sales:
      "Etsy Sold Orders Order Total, including reported shipping and source residuals. Not Shopify total sales or reconciled accounting turnover. Five FY26 residual exceptions remain documented.",
    orders:
      "Distinct Etsy Sold Orders; refund eligibility validated against paired payment evidence and period controls.",
  };
  function attach(records, snapshot, basis, error) {
    records.marketplaces = { snapshot, basis, error };
    return records;
  }
  function aggregate(records, opts, legacyAggregate) {
    const { snapshot, basis, error } = records.marketplaces;
    const start = String(opts.startDate || opts.startPeriod);
    const end = String(opts.endDate || opts.endPeriod);
    const startDate = start.length === 7 ? start + "-01" : start;
    const endDate =
      end.length === 7
        ? new Date(Date.UTC(+end.slice(0, 4), +end.slice(5), 0))
            .toISOString()
            .slice(0, 10)
        : end;
    F.day(startDate);
    F.day(endDate);
    const imported = legacyAggregate(
      records.finance?.legacy || Array.from(records),
      { ...opts, channels: ["etsy"] },
    );
    const base = {
      ...imported,
      revenue: null,
      orders: null,
      aov: null,
      nativeAov: null,
      financialBasis: basis,
      financialSource: "etsy",
      definition: DEFINITIONS[basis],
      unitsStatus: imported.status,
    };
    if (!LABELS[basis]) throw Error("Unknown Etsy financial basis");
    if (imported.status === "not-occurred") return base;
    const rows = snapshot?.channels?.etsy?.daily || [];
    const byDate = new Map(rows.map((r) => [r.date, r]));
    let chosen = [],
      missing = 0;
    for (let d = startDate; d <= endDate; d = F.next(d)) {
      const r = byDate.get(d);
      if (!r || r.completeness !== "validated") missing++;
      else chosen.push(r);
    }
    if (missing)
      return {
        ...base,
        status: chosen.length ? "incomplete-data" : "no-data",
        note:
          error ||
          `Etsy financial coverage unavailable for ${missing} selected days. No imported gross fallback or estimated net sales. Last validated complete month: ${snapshot?.channels?.etsy?.months?.at(-1)?.month || "none"}.`,
      };
    const revenue = chosen.reduce((s, r) => s + r[basis], 0) / 100,
      orders = chosen.reduce((s, r) => s + r.orders, 0);
    return {
      ...base,
      revenue,
      orders,
      aov: orders ? revenue / orders : null,
      status: "complete",
      gapCount: 0,
      recordCount: chosen.length,
      note: `Etsy historical source-validated CSV coverage; live refresh requires new paired exports and Stats controls. ${error ? "Latest refresh failed; last-good data retained. " : ""}Purchased units remain imported; unit coverage is independent.`,
    };
  }
  return { VERSION, LABELS, DEFINITIONS, attach, aggregate };
});
