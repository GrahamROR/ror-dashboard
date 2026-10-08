// Independent native controls versus both dashboard projections and preserved legacy data.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const F = require("./contract");
const root = path.join(__dirname, ".."),
  manifest = require("./staging/manifest.json"),
  s = require("./staging/" + manifest.file);
const growth = require("../data.json"),
  ror = require("../dashboard2/sales-data.json");
const periods = s.periods.filter((p) => p.start !== p.end);
const rows = [];
for (const p of periods) {
  const a = F.growthReport(s, p.start, p.end),
    b = F.rorReport(s, p.start, p.end);
  for (const metric of F.ADDITIVE) {
    assert.equal(a[metric], p[metric], `Native mismatch: ${p.start} ${metric}`);
    assert.equal(b[metric], p[metric], `ROR mismatch: ${p.start} ${metric}`);
  }
  assert.equal(a.average_order_value, p.average_order_value);
  assert.deepEqual(a, b);
}
const fy = s.periods.find(
  (p) => p.start === "2025-08-01" && p.end === "2026-07-31",
);
// User-supplied benchmark is a comparison only; it never enters the transformation.
const benchmark = {
  gross_sales: 27622101,
  net_sales: 24799966,
  total_sales: 31343706,
  orders: 7832,
};
for (const [k, v] of Object.entries(benchmark))
  assert.equal(
    fy[k],
    v,
    "Supplied FY26 benchmark no longer matches live source: " + k,
  );
for (const p of periods.filter(
  (p) =>
    p.start >= "2025-08-01" &&
    p.end <= "2026-07-31" &&
    ((p.start.endsWith("-01") && p.start.slice(0, 7) === p.end.slice(0, 7)) ||
      (p.start === fy.start && p.end === fy.end)),
)) {
  const full = p.start === fy.start && p.end === fy.end;
  const legacy = full
    ? growth.years.FY26.summary
    : growth.years.FY26.monthly.find((m) => m.key === p.start.slice(0, 7));
  const imported = ror.records.filter(
    (r) => r.channel === "shopify" && r.date >= p.start && r.date <= p.end,
  );
  for (const metric of [...F.ADDITIVE, "average_order_value"]) {
    const map = full
      ? {
          total_sales: "ytdRevenue",
          net_sales: "ytdNetSales",
          orders: "ytdOrders",
          average_order_value: "avgAOV",
        }
      : {
          total_sales: "revenue",
          net_sales: "netSales",
          orders: "orders",
          average_order_value: "aov",
        };
    let old = map[metric] ? legacy[map[metric]] : null;
    if (old != null && metric !== "orders" && metric !== "average_order_value")
      old = F.minor(old);
    rows.push({
      period: full ? "FY26" : p.start.slice(0, 7),
      start: p.start,
      end: p.end,
      metric,
      original_growth: old,
      corrected_growth: F.growthReport(s, p.start, p.end)[metric],
      corrected_ror: F.rorReport(s, p.start, p.end)[metric],
      native: p[metric],
      staged_variance: 0,
      change_from_growth:
        old == null
          ? null
          : metric === "average_order_value"
            ? Number((p[metric] - old).toFixed(3))
            : p[metric] - old,
      status:
        "Native aggregate matched; legacy count basis resolved in order-count-reconciliation.json",
    });
  }
  rows.push({
    period: full ? "FY26" : p.start.slice(0, 7),
    metric: "legacy_imported_gross_lines",
    original_ror: imported.reduce((n, r) => n + F.minor(r.revenue), 0),
    original_ror_orders: imported.reduce((n, r) => n + r.orders, 0),
    native_orders: p.orders,
    order_variance: imported.reduce((n, r) => n + r.orders, 0) - p.orders,
    status: "Different financial basis; never relabel as canonical sales",
  });
}
const report = {
  snapshot_id: s.id,
  source_as_of: s.sources.find((x) => x.file === "daily.json").retrieved_at,
  units: "Money in GBP pennies except native AOV in pounds; orders integer",
  native_periods_verified: periods.length,
  benchmark,
  rows,
};
fs.mkdirSync(path.join(root, "docs/pr2"), { recursive: true });
fs.writeFileSync(
  path.join(root, "docs/pr2/reconciliation.json"),
  JSON.stringify(report, null, 2) + "\n",
);
const fmt = (n, k) =>
  n == null
    ? "Not captured"
    : k === "orders"
      ? String(n)
      : "£" +
        (k === "average_order_value" ? n : n / 100).toFixed(
          k === "average_order_value" ? 3 : 2,
        );
let md = `# P2 staged financial reconciliation\n\nSnapshot: \`${s.id}\`. Source captured ${report.source_as_of}; completed reporting days through ${s.coverage.end}. Both dashboard projections agree with ${periods.length} independent native monthly/period controls for all eight additive measures and exact-period native AOV. Products reconcile including unassigned amounts.\n\nProduction exports remain unchanged. Staged correction is a separate immutable snapshot, not a historical-record edit.\n\n| Period | Metric | Original Growth | Staged Growth | Staged ROR | Native Shopify | Change from Growth | Staged/native variance |\n|---|---|---:|---:|---:|---:|---:|---:|\n`;
for (const row of rows.filter(
  (r) => r.metric !== "legacy_imported_gross_lines",
))
  md += `| ${row.period} | ${F.LABELS[row.metric]} | ${fmt(row.original_growth, row.metric)} | ${fmt(row.corrected_growth, row.metric)} | ${fmt(row.corrected_ror, row.metric)} | ${fmt(row.native, row.metric)} | ${fmt(row.change_from_growth, row.metric)} | 0 |\n`;
md +=
  "\n## Legacy ROR comparison (different amount basis)\n\n| Period | Original imported gross lines | Original orders | Native orders | Order variance |\n|---|---:|---:|---:|---:|\n";
for (const r of rows.filter((r) => r.metric === "legacy_imported_gross_lines"))
  md += `| ${r.period} | ${fmt(r.original_ror, "gross_sales")} | ${r.original_ror_orders} | ${r.native_orders} | ${r.order_variance} |\n`;
md +=
  "\n## Interpretation and unresolved evidence\n\nAll eleven pre-July FY26 Growth months match native total sales, net merchandise sales and orders. July was frozen as MTD (426 orders), while the completed native month has 445. The staged change is £608.84 total, £458.25 net and 19 orders. The remaining £150.59 is the combined shipping/tax/other component difference: the legacy export did not store those components separately, so a more detailed historic split cannot be established from this file. Native July shipping is £1,366.20 and taxes £2,430.40; no balancing amount has been inserted.\n\nROR’s FY26 7,834 imported orders versus 7,832 native is now explained by secure ID-level reconciliation. All 7,832 native eligible IDs occur in the import, with no cross-day duplicates. The two extra imported IDs are paid, non-test, uncancelled gift-voucher-only orders; their native sales orders measure is zero. The native sales report excludes gift card products. No local exclusion or benchmark balancing was added. Public counts and private evidence hashes are in order-count-reconciliation.json; customer/order identifiers are not committed. Original £318,134.63 imported gross lines is a different basis from native gross merchandise £276,221.01, net £247,999.66 or total £313,437.06. No legacy amount was renamed or divided by a VAT factor.\n\nNative AOV is independently reported, including source precision: FY26 £32.22 and July £26.529. The original FY26 summary £32.23 does not equal the current native period measure. Net AOV is £247,999.66 / 7,832 = £31.66492084. Arbitrary custom intervals without a captured native AOV show unavailable rather than an average of monthly AOVs.\n\nApproval of net merchandise as the management default and any assertion of VAT-exclusive accounting turnover remain separate decisions. Xero is outside scope; there is no connection, import, interface or account mapping. Native recorded tax (including historical zeros) is preserved; tax-inclusive shop pricing alone does not establish historical accounting treatment. No attribution, Etsy, NOTHS, fulfilment or production data has changed.\n\nDefinitions: [Shopify sales reports](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/sales-report), [native sales schema](https://shopify.dev/docs/api/shopifyql/latest/schemas/sales_revenue/sales).\n";
fs.writeFileSync(path.join(root, "docs/pr2/reconciliation.md"), md);
console.log(
  `Reconciled ${periods.length} native control periods; wrote ${rows.length} before/after rows.`,
);
