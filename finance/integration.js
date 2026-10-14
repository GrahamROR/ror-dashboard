// Adapters for the existing dashboards. Source records and marketing fields are immutable.
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./contract"), require("./management"));
  else root.ShopifyIntegration = factory(root.ShopifyFinance, root.ManagementFinance);
})(typeof window === "undefined" ? globalThis : window, function (F, M) {
  "use strict";
  const BASIS = ["net_revenue", "gross_revenue", "net_sales", "gross_sales", "total_sales", "legacy_gross"];
  const labels = {
    legacy_gross: "Legacy Imported Gross (ROR Sales only)",
    net_revenue: "Net Revenue Including Shipping",
    gross_revenue: "Gross Revenue Including Shipping",
    net_sales: "Net Sales",
    gross_sales: "Gross Sales",
    total_sales: "Total Sales",
  };
  const aovLabel = (b) =>
    b === "net_revenue" || b === "gross_revenue" ? labels[b]+" per order" :
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
    const derived = snapshot ? M.shopify(snapshot,start,end,basis) : null;
    const value = derived?.value ?? null;
    return {
      ...r,
      status: value==null ? "missing" : r.status,
      warnings: [...(r.warnings||[]),...(derived?.warning?[derived.warning]:[])],
      revenue: pounds(value),
      netSales: pounds(r.net_sales),
      totalSales: pounds(r.total_sales),
      aov: r.average_order_value,
      netAov: r.net_aov,
      basisAov:
        r.orders > 0 && value != null ? value / 100 / r.orders : null,
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
    const requested = yearRange(view.fy, now);
    const range = {...requested, requestedEnd:requested.end, end:requested.end<requested.close && snapshot?.coverage.end && snapshot.coverage.end<requested.end ? snapshot.coverage.end : requested.end};
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
        estGrossProfit: r.netSales!=null && Number.isFinite(m.marginPctCovered) && (last<=range.end || view.marketingYesterday?.date===end) ? Math.round(r.netSales*m.marginPctCovered*100)/100 : null,
        productProfitVersion: 'canonical-net-product-proxy-v1',
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
        future: start > requested.end,
      };
    });
    const summary = {
      ...view.summary,
      ytdRevenue: result.revenue,
      ytdNetSales: result.netSales,
      ytdEstGrossProfit: result.status==='actual' && monthly.filter(m=>m.financialStart<=range.end).every(m=>m.estGrossProfit!=null) ? monthly.filter(m=>m.financialStart<=range.end).reduce((s,m)=>s+Math.round(m.estGrossProfit*100),0)/100 : null,
      productProfitVersion: 'canonical-net-product-proxy-v1',
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
      snapshot && basis!=='legacy_gross' && range.start <= range.end
        ? F.products(snapshot, range.start, range.end, basis==='net_revenue'?'net_sales':basis==='gross_revenue'?'gross_sales':basis)
        : { rows: [], status: "missing", residual: null };
    const topProducts = grouped.rows.slice(0, 10).map((p) => ({
      ...originalProducts.get(p.title),
      name: p.title,
      revenue: pounds(p.value),
      orders: originalProducts.get(p.title)?.orders ?? null,
    }));
    const y = view.marketingYesterday || view.yesterday;
    const yesterdayDate = F.next(range.today, -1);
    const yr = report(snapshot, yesterdayDate, yesterdayDate, basis);
    const sameMarketingDate = y?.date === yesterdayDate;
    const marketing = y ? { ...y } : null;
    if (marketing && !sameMarketingDate)
      for (const field of [
        "customers",
        "returning",
        "repeatRate",
        "sessions",
        "convertedSessions",
        "conversionRate",
        "shopifyConversionRate",
        "margin",
        "profit",
        "costCoverage",
      ])
        marketing[field] = null;
    return {
      ...view,
      monthly,
      summary,
      topProducts,
      yesterday: {
            ...marketing,
            ...yr,
            profit: yr.netSales!=null && sameMarketingDate && Number.isFinite(marketing?.margin) ? Math.round(yr.netSales*marketing.margin*100)/100 : null,
            productProfitVersion: 'canonical-net-product-proxy-v1',
            date: yesterdayDate,
            monthKey: yesterdayDate.slice(0, 7),
            importedMarketingDate: y?.date || null,
            marketingAvailable: sameMarketingDate,
          },
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
    // Consolidated commercial reporting stays wholly on the preserved legacy import until P3.
    // Never blend canonical Shopify amounts/counts with unreconciled marketplace inputs.
    if (other.length)
      return {
        ...imported,
        financialBasis: "legacy-imported-gross",
        unitsStatus: imported.status,
        note: [
          imported.note,
          "Legacy imported gross figures across all selected stores; not reconciled net sales. AOV uses the same imported orders. Pending P3.",
        ]
          .filter(Boolean)
          .join(" "),
      };
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
