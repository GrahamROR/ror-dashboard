// Adapters for the existing dashboards. Source records and marketing fields are immutable.
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./contract"));
  else root.ShopifyIntegration = factory(root.ShopifyFinance);
})(typeof window === "undefined" ? globalThis : window, function (F) {
  "use strict";
  const BASIS = ["net_sales", "gross_sales", "total_sales"];
  const labels = {
    net_sales: "Net Sales",
    gross_sales: "Gross Sales",
    total_sales: "Total Sales",
  };
  const aovLabel = (b) =>
    b === "net_sales"
      ? "Net AOV"
      : b === "gross_sales"
        ? "Gross sales per order"
        : "Total sales per order";
  const pounds = (n) => (n == null ? null : n / 100);
  function report(snapshot, start, end, basis) {
    if (!BASIS.includes(basis)) throw Error("Unknown financial basis");
    const r = snapshot
      ? F.select(snapshot, start, end)
      : {
          status: "missing",
          orders: null,
          net_aov: null,
          average_order_value: null,
          warnings: ["Verified Shopify finance unavailable."],
        };
    return {
      ...r,
      revenue: pounds(r[basis]),
      netSales: pounds(r.net_sales),
      totalSales: pounds(r.total_sales),
      aov: r.average_order_value,
      netAov: r.net_aov,
      basisAov:
        r.orders > 0 && r[basis] != null ? r[basis] / 100 / r.orders : null,
      basis,
    };
  }
  function yearRange(fy, now = new Date()) {
    const year = 2000 + Number(fy.slice(2)),
      start = `${year - 1}-08-01`,
      close = `${year}-07-31`;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const yesterday = F.next(today, -1);
    return { start, end: close < yesterday ? close : yesterday, close, today };
  }
  function growthView(view, snapshot, basis, now = new Date()) {
    if (!view) return null;
    const range = yearRange(view.fy, now);
    const result =
      range.start <= range.end
        ? report(snapshot, range.start, range.end, basis)
        : {
            revenue: null,
            orders: null,
            aov: null,
            netAov: null,
            totalSales: null,
            status: "missing",
          };
    const monthly = (view.monthly || []).map((m) => {
      const start = m.key + "-01",
        last = new Date(
          Date.UTC(Number(m.key.slice(0, 4)), Number(m.key.slice(5, 7)), 0),
        )
          .toISOString()
          .slice(0, 10),
        end = last < range.end ? last : range.end;
      const r =
        start <= end
          ? report(snapshot, start, end, basis)
          : {
              revenue: null,
              orders: null,
              aov: null,
              netSales: null,
              totalSales: null,
              status: "missing",
            };
      return {
        ...m,
        revenue: r.revenue,
        netSales: r.netSales,
        totalSales: r.totalSales,
        orders: r.orders,
        aov: r.aov,
        netAov: r.netAov,
        basisAov: r.basisAov,
        financialStatus: r.status,
        financialStart: start,
        financialEnd: end,
        complete: r.status === "actual" && last <= range.end,
        mtd: start <= range.end && last > range.end,
        future: start > range.end,
      };
    });
    const summary = {
      ...view.summary,
      ytdRevenue: result.revenue,
      ytdNetSales: result.netSales,
      ytdTotalSales: result.totalSales,
      ytdOrders: result.orders,
      avgAOV: result.aov,
      netAov: result.netAov,
      basisAov: result.basisAov,
      financialStatus: result.status,
    };
    const originalProducts = new Map(
      (view.topProducts || []).map((p) => [p.name, p]),
    );
    const grouped =
      snapshot && range.start <= range.end
        ? F.products(snapshot, range.start, range.end, basis)
        : { rows: [], status: "missing", residual: null };
    const topProducts = grouped.rows
      .slice(0, 10)
      .map((p) => ({
        ...originalProducts.get(p.title),
        name: p.title,
        revenue: pounds(p.value),
        orders: originalProducts.get(p.title)?.orders ?? null,
      }));
    const y = view.yesterday;
    const yr = y ? report(snapshot, y.date, y.date, basis) : null;
    return {
      ...view,
      monthly,
      summary,
      topProducts,
      yesterday: y ? { ...y, ...yr } : null,
      finance: {
        ...result,
        ...range,
        snapshot_id: snapshot?.id,
        productStatus: grouped.status,
        productResidual: grouped.residual,
        sourceRetrievedAt: snapshot?.sources.find(
          (s) => s.file === "daily.json",
        )?.retrieved_at,
      },
    };
  }
  function rorRecords(legacy, snapshot, basis, error) {
    const records = legacy.slice();
    records.finance = { legacy, snapshot, basis, error };
    return records;
  }
  function aggregateRor(records, opts, legacyAggregate) {
    const { legacy, snapshot, basis, error } = records.finance;
    const start =
      String(opts.startDate || opts.startPeriod).length === 7
        ? (opts.startDate || opts.startPeriod) + "-01"
        : opts.startDate || opts.startPeriod;
    let end = opts.endDate || opts.endPeriod;
    if (String(end).length === 7)
      end = new Date(
        Date.UTC(Number(end.slice(0, 4)), Number(end.slice(5, 7)), 0),
      )
        .toISOString()
        .slice(0, 10);
    const requested = opts.channels,
      other = requested.filter((c) => c !== "shopify");
    const imported = legacyAggregate(legacy, { ...opts, channels: requested });
    const native = report(snapshot, start, end, basis),
      shops = legacy.filter(
        (r) => r.channel === "shopify" && r.date >= start && r.date <= end,
      );
    const unitCoverage = legacyAggregate(legacy, {
      ...opts,
      channels: ["shopify"],
    });
    const units =
      shops.length && shops.every((r) => r.units != null)
        ? shops.reduce((n, r) => n + r.units, 0)
        : null;
    const marketplace = other.length
      ? legacyAggregate(legacy, { ...opts, channels: other })
      : null;
    const mixed = other.length > 0,
      complete =
        native.status === "actual" &&
        (!marketplace || marketplace.status === "complete");
    const now = opts.nowDate || opts.nowPeriod;
    return {
      ...imported,
      revenue: mixed ? null : native.revenue,
      orders:
        native.orders == null || marketplace?.orders === null
          ? null
          : native.orders + (marketplace?.orders || 0),
      units: mixed ? imported.units : units,
      aov: mixed ? null : native.basisAov,
      netAov: native.netAov,
      nativeAov: native.aov,
      status:
        now && start > now
          ? "not-occurred"
          : mixed || !complete
            ? "incomplete-data"
            : "complete",
      gapCount: native.missingDays || 0,
      financialBasis: basis,
      unitsStatus: unitCoverage.status,
      note: mixed
        ? "Combined revenue/AOV unavailable: Shopify uses " +
          F.LABELS[basis] +
          ", while Etsy and NOTHS retain imported gross line sales. Individual channel values remain available."
        : !complete
          ? error ||
            native.warnings?.join(" ") ||
            "Verified Shopify source coverage unavailable."
          : units == null
            ? "Shopify financial figures are verified; imported purchased units are unavailable."
            : null,
    };
  }
  return {
    BASIS,
    labels,
    aovLabel,
    report,
    yearRange,
    growthView,
    rorRecords,
    aggregateRor,
  };
});
