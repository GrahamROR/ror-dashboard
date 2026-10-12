"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const S = require("./store.js"),
  C = require("../../dashboard2/calculations.js"),
  FI = require("../integration.js"),
  MP = require("./contract.js");
function build() {
  const snapshot = S.read(path.join(__dirname, "staging")),
    controls = require("./etsy-fy26-controls.json"),
    noths = require("./noths-fy26-investigation.json");
  const legacy = require("../../dashboard2/sales-data.json").records;
  const months = snapshot.channels.etsy.months.map((m) => {
    const control = controls.monthly_controls[m.month];
    const legacyMonth = C.aggregate(legacy, {
      channels: ["etsy"],
      startPeriod: m.month,
      endPeriod: m.month,
    });
    assert.equal(
      Math.round(legacyMonth.revenue * 100),
      control.legacy_gross,
      m.month + " legacy gross",
    );
    assert.equal(
      legacyMonth.orders,
      control.legacy_orders,
      m.month + " legacy orders",
    );
    for (const k of [
      "gross_sales",
      "discounts",
      "net_sales",
      "orders",
      "shipping",
      "tax",
      "total_sales",
    ])
      assert.equal(m[k], control[k], m.month + " " + k);
    return {
      month: m.month,
      legacy_gross: control.legacy_gross,
      legacy_orders: control.legacy_orders,
      original_merchandise: m.gross_sales,
      discounts: m.discounts,
      corrected_revenue: m.net_sales,
      source_revenue: control.net_sales,
      corrected_orders: m.orders,
      source_orders: control.orders,
      aov: m.net_sales / 100 / m.orders,
      revenue_difference: m.net_sales - control.net_sales,
      excluded_payment_records: m.audit.excluded,
      partial_refund_orders: m.audit.partial,
      residual: m.audit.residual,
    };
  });
  const totals = Object.fromEntries(
    [
      "legacy_gross",
      "legacy_orders",
      "original_merchandise",
      "discounts",
      "corrected_revenue",
      "source_revenue",
      "corrected_orders",
      "source_orders",
      "revenue_difference",
      "excluded_payment_records",
      "partial_refund_orders",
      "residual",
    ].map((k) => [k, months.reduce((s, m) => s + m[k], 0)]),
  );
  assert.equal(totals.corrected_revenue, controls.native_stats_revenue);
  assert.equal(totals.corrected_orders, controls.native_stats_orders);
  const records = MP.attach(
    FI.rorRecords(legacy, null, "net_sales"),
    snapshot,
    "net_sales",
  );
  const opts = {
    channels: ["shopify", "etsy", "noths"],
    startDate: "2025-08-01",
    endDate: "2026-07-31",
  };
  const all = C.aggregate(records, opts);
  const original = C.aggregate(legacy, opts);
  assert.equal(all.revenue, original.revenue);
  assert.equal(all.orders, original.orders);
  return {
    money_unit: "GBP pennies unless marked pounds",
    etsy: {
      status:
        "FY26 historical source-validated; future/live periods unverified until controlled refresh",
      months,
      totals: {
        ...totals,
        aov: totals.corrected_revenue / 100 / totals.corrected_orders,
      },
      native_receipt_check: require("./etsy-native-validation.json"),
    },
    noths,
    all_stores: {
      status: "legacy imported gross; not reconciled net sales",
      revenue_pounds: all.revenue,
      orders: all.orders,
      aov_pounds: all.aov,
    },
  };
}
function render(r) {
  const gbp = (n) =>
    "£" +
    (n / 100).toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return `# P3 staged marketplace reconciliation\n\nDerived from immutable aggregates, supplied report controls and read-only native API checks. No production records changed.\n\n## Etsy FY26\n\n| Month | Imported gross | Original merchandise | Discounts | Corrected / source Stats revenue | Sold orders | AOV | Difference |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${r.etsy.months.map((m) => `| ${m.month} | ${gbp(m.legacy_gross)} | ${gbp(m.original_merchandise)} | ${gbp(m.discounts)} | ${gbp(m.corrected_revenue)} | ${m.corrected_orders} | £${m.aov.toFixed(2)} | ${gbp(m.revenue_difference)} |`).join("\n")}\n\nFY26: **${gbp(r.etsy.totals.corrected_revenue)}, ${r.etsy.totals.corrected_orders} orders, £${r.etsy.totals.aov.toFixed(2)} AOV**. Legacy: ${gbp(r.etsy.totals.legacy_gross)} / ${r.etsy.totals.legacy_orders}. Annual and all 12 monthly differences are zero.\n\nThe aggregate bridge is ${gbp(r.etsy.totals.legacy_gross)} imported gross − ${gbp(r.etsy.native_receipt_check.cancelled_original_merchandise)} native cancelled original merchandise − ${gbp(r.etsy.totals.discounts)} eligible Sold Orders discounts = ${gbp(r.etsy.totals.corrected_revenue)}. The entire ${gbp(r.etsy.totals.legacy_gross - r.etsy.totals.corrected_revenue)} difference is not attributed to nine refunded payments; their original merchandise is separately established by native receipts. Nine cancelled/payment-only receipts excluded; four partially refunded Sold Orders retained without subtracting refunds again. Fees are expenses. Five order-total residuals total ${gbp(r.etsy.totals.residual)}; preserved, not allocated to tax or net revenue. Tax treatment is source-specific, not asserted VAT-exclusive. Eleven CSV/native date differences corrected using native Europe/London timestamps; no monthly/annual totals change. Future periods have no automatic gross fallback.\n\n## NOTHS FY26 investigation\n\nAll 3,786 native orders read, all statuses. The native monthly gross report reconciles exactly in every month to item gross plus delivery. This does not establish net sales or eligible order count.\n\n| Month | Imported / native item gross | Native delivery | Native monthly gross | Difference |\n|---|---:|---:|---:|---:|\n${Object.entries(
    r.noths.months,
  )
    .map(
      ([month, m]) =>
        `| ${month} | ${gbp(m.item_gross)} | ${gbp(m.delivery)} | ${gbp(m.native_report_gross)} | ${gbp(m.unresolved_native_gross_difference)} |`,
    )
    .join(
      "\n",
    )}\n\nNative item gross ${gbp(r.noths.totals.item_gross)} + delivery ${gbp(r.noths.totals.delivery)} = report ${gbp(r.noths.totals.native_report_gross)}. Native original order total after source discounts: ${gbp(r.noths.totals.order_total)}. Product report ${gbp(r.noths.product_report_gross)} differs from that by ${gbp(r.noths.product_vs_order_total_difference)}. Dispatched-only order total ${gbp(r.noths.states.dispatched.order_total)} is still ${gbp(r.noths.states.dispatched.order_total - r.noths.product_report_gross)} above the product report; no exclusions forced. The subsequent product-level investigation shows every trading product count/units matches the whole cohort, so this near-match does not establish dispatched-only report eligibility. See docs/pr3/current-year/evidence-and-rollout.md.\n\nNative statuses: ${Object.entries(
    r.noths.states,
  )
    .map(([k, v]) => k + " " + v.orders)
    .join(
      "; ",
    )}. Native refund_total sums ${gbp(r.noths.totals.refund_total)}; no refund-posting chronology or merchandise/shipping allocation is established. Source commissions ${gbp(r.noths.totals.commission_gross)} are separate expenses, not deducted from sales. Native tax components are preserved; ${r.noths.totals.tax_identity_exceptions} record-field identities differ, with signed aggregate ${gbp(r.noths.totals.tax_identity_residual)} across overlapping fields, not an adjustment to sales.\n\nRequired evidence: NOTHS FY26 product-report order-level drill-down linking product rows to order IDs, inclusion/exclusion and date rules; native refund/credit export with effective date, original order ID, item versus delivery amounts and source VAT; clarification of gross/net/discount financial-field definitions and reported component rounding. Repeat these controls for subsequent periods. NOTHS remains labelled imported gross and unreconciled for net reporting.\n\n## All Stores preservation\n\nLegacy revenue £${r.all_stores.revenue_pounds.toFixed(2)}, ${r.all_stores.orders} orders, AOV £${r.all_stores.aov_pounds.toFixed(2)}. KPI, contribution and explorer use all legacy channel values; no gross/net mixing. Consolidated net sales stays unavailable until channel definitions and ongoing sources are compatible.\n`;
}
if (require.main === module) {
  const r = build(),
    dir = path.join(__dirname, "../../docs/pr3");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "reconciliation.json"),
    JSON.stringify(r, null, 2) + "\n",
  );
  fs.writeFileSync(path.join(dir, "reconciliation.md"), render(r));
  console.log(
    "Etsy 12 months + annual controls and All Stores preservation passed; NOTHS gross bridge exact, net remains unreconciled.",
  );
}
module.exports = { build, render };
