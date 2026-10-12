// Prepare new-period controls from paired exports PLUS independent human-supplied Stats evidence.
// Writes private control files only; does not import, publish, estimate or derive Stats benchmarks.
"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  F = require("../contract"),
  E = require("./etsy");
function prepare({ soldDir, paymentDir, stats }) {
  if (stats.schema !== "etsy-stats-controls-v1" || !stats.months?.length)
    throw Error("Independent Etsy Stats controls required");
  const controls = {
    source: "new paired Etsy exports + independently captured Stats",
    monthly_controls: {},
    native_stats_revenue: 0,
    native_stats_orders: 0,
  };
  for (const s of stats.months) {
    if (!/^\d{4}-\d{2}$/.test(s.month) || controls.monthly_controls[s.month])
      throw Error("Invalid/duplicate Stats month");
    const end = new Date(Date.UTC(+s.month.slice(0, 4), +s.month.slice(5), 0))
      .toISOString()
      .slice(0, 10);
    if (
      s.start !== s.month + "-01" ||
      s.end_inclusive !== end ||
      s.currency !== "GBP" ||
      s.reporting_timezone !== "Europe/London" ||
      s.source_policy_verified !== true ||
      !s.stats_evidence_reference ||
      !s.review_reference ||
      !Number.isFinite(Date.parse(s.captured_at))
    )
      throw Error("Incomplete independent period/source-policy verification");
    const net = F.minor(s.revenue_gbp);
    if (
      net == null ||
      net < 0 ||
      !Number.isSafeInteger(s.orders) ||
      s.orders < 0
    )
      throw Error("Missing independent Stats revenue/order count");
    const suffix =
      s.month.slice(0, 4) + "-" + Number(s.month.slice(5)) + ".csv";
    const sold = E.csv(
      fs.readFileSync(path.join(soldDir, "EtsySoldOrders" + suffix), "utf8"),
    );
    const payment = E.csv(
      fs.readFileSync(
        path.join(paymentDir, "EtsyDirectCheckoutPayments" + suffix),
        "utf8",
      ),
    );
    function total(rows, key) {
      return rows.reduce((sum, r) => {
        const n = F.minor(r[key]);
        if (n == null) throw Error("Missing financial field: " + key);
        return sum + n;
      }, 0);
    }
    const gross = total(sold, "Order Value"),
      discounts = total(sold, "Discount Amount");
    if (gross - discounts !== net || sold.length !== s.orders)
      throw Error(
        "Independent Stats mismatch; investigate, never manufacture an adjustment",
      );
    controls.monthly_controls[s.month] = {
      complete: true,
      currency: "GBP",
      timezone: "Europe/London",
      gross_sales: gross,
      discounts,
      net_sales: net,
      orders: s.orders,
      total_sales: total(sold, "Order Total"),
      shipping: total(sold, "Shipping"),
      tax: total(sold, "Sales Tax"),
      payment_records: payment.length,
      payment_gross: total(payment, "Gross Amount"),
      refunds: total(payment, "Refund Amount"),
      fees: total(payment, "Fees"),
      independent_stats: {
        evidence: s.stats_evidence_reference,
        captured_at: s.captured_at,
        review: s.review_reference,
        source_policy_verified: true,
      },
    };
    controls.native_stats_revenue += net;
    controls.native_stats_orders += s.orders;
  }
  return controls;
}
if (require.main === module) {
  const [soldDir, paymentDir, statsFile, out] = process.argv.slice(2);
  if (
    !out ||
    !path.resolve(out).startsWith(path.resolve("finance/local-data") + path.sep)
  )
    throw Error("Prepared controls must stay in ignored finance/local-data");
  const c = prepare({
    soldDir,
    paymentDir,
    stats: JSON.parse(fs.readFileSync(statsFile)),
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(c, null, 2) + "\n");
  console.log(
    "Prepared independent controls; run native-evidence validation/import in private staging before review.",
  );
}
module.exports = { prepare };
