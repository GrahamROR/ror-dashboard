// Diagnostic hypotheses over read-only evidence; never used as dashboard revenue or an importer.
"use strict";
const F = require("../contract"),
  N = require("./noths");
function gcd(a, b) {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}
function add(a, b) {
  const num = a.num * b.den + b.num * a.den,
    den = a.den * b.den,
    g = gcd(num, den);
  return { num: num / g, den: den / g };
}
function round(f) {
  return Number((2n * f.num + f.den) / (2n * f.den));
}
function investigate(rows, report) {
  const productMap = new Map(),
    nativeGross = { item: 0, delivery: 0 };
  let fullRefund = 0,
    partialRefund = 0,
    fullCount = 0,
    partialCount = 0;
  for (const o of rows) {
    nativeGross.delivery += N.money(o.delivery_total);
    const refund = N.money(o.refund_total);
    if (refund) {
      if (o.state === "refunded") {
        fullRefund += refund;
        fullCount++;
      } else {
        partialRefund += refund;
        partialCount++;
      }
    }
    for (const i of o.items) {
      if (!i.product?.id || !Number.isSafeInteger(i.quantity))
        throw Error("Missing native product/quantity evidence");
      const gross = N.money(i.listing_total_gross);
      nativeGross.item += gross;
      const p = productMap.get(i.product.id) || {
        title: i.product.title,
        orders: new Set(),
        units: 0,
        gross: 0,
        delivery_fraction: { num: 0n, den: 1n },
        dispatched_orders: new Set(),
        dispatched_units: 0,
      };
      p.orders.add(o.id);
      p.units += i.quantity;
      p.gross += gross;
      p.delivery_fraction = add(p.delivery_fraction, {
        num: BigInt(N.money(o.delivery_total)),
        den: BigInt(o.items.length),
      });
      if (o.state === "dispatched") {
        p.dispatched_orders.add(o.id);
        p.dispatched_units += i.quantity;
      }
      productMap.set(i.product.id, p);
    }
  }
  // An observed ID relationship must be corroborated by exact titles AND order/unit counts.
  const active = report.filter((r) => Number(r.Sales) > 0),
    compared = [];
  let reportTotal = 0,
    knownGross = 0,
    knownDelivery = { num: 0n, den: 1n };
  for (const r of report) {
    const money = F.minor(r["Gross Turnover (£)"]);
    if (money != null) reportTotal += money;
  }
  for (const r of active) {
    const p = productMap.get(Number(r["Product Code"]) - 10000);
    if (
      !p ||
      p.title !== r["Product Name"] ||
      p.orders.size !== Number(r.Sales) ||
      p.units !== Number(r["Units Sold"])
    )
      throw Error(
        "Product association not corroborated; require source mapping",
      );
    const actual = F.minor(r["Gross Turnover (£)"]);
    const candidate = round(
      add({ num: BigInt(p.gross), den: 1n }, p.delivery_fraction),
    );
    compared.push({
      product_code: r["Product Code"],
      report_gross_pence: actual,
      native_item_gross_pence: p.gross,
      candidate_gross_with_equal_line_delivery_pence: candidate,
      candidate_difference_pence: actual - candidate,
      report_orders: Number(r.Sales),
      native_all_orders: p.orders.size,
      report_units: Number(r["Units Sold"]),
      native_all_units: p.units,
      dispatched_orders: p.dispatched_orders.size,
      dispatched_units: p.dispatched_units,
    });
    knownGross += p.gross;
    knownDelivery = add(knownDelivery, p.delivery_fraction);
  }
  const missing = [...productMap.entries()].filter(
    ([id]) => !active.some((r) => Number(r["Product Code"]) === id + 10000),
  );
  const nativeTotal = nativeGross.item + nativeGross.delivery;
  return {
    status:
      "diagnostic only; not verified net sales or a published financial adjustment",
    product_id_association:
      "API ID + 10000 matches report Product Code for all trading report products, independently corroborated by exact title, distinct-order count and units; no StockHub SKU mappings changed",
    active_report_products: active.length,
    native_products: productMap.size,
    all_order_and_unit_count_matches: compared.length,
    dispatched_count_mismatches: compared.filter(
      (r) =>
        r.report_orders !== r.dispatched_orders ||
        r.report_units !== r.dispatched_units,
    ).length,
    source_gross: nativeGross,
    native_gross_total: nativeTotal,
    product_report_total: reportTotal,
    monthly_vs_products_difference: nativeTotal - reportTotal,
    missing_report_products: missing.length,
    missing_item_gross: missing.reduce((s, [, p]) => s + p.gross, 0),
    missing_units: missing.reduce((s, [, p]) => s + p.units, 0),
    diagnostic_delivery_allocation: {
      hypothesis:
        "Original merchandise gross + charged delivery divided equally among order-item lines, accumulated before product rounding; not a net-sales/refund rule",
      rounding:
        "Exact rational allocation; half-up product rounding. Other platform rounding rules are not assumed.",
      matched_product_values: compared.filter(
        (r) => r.candidate_difference_pence === 0,
      ).length,
      remaining_product_differences: compared.filter(
        (r) => r.candidate_difference_pence !== 0,
      ),
      candidate_report_total: compared.reduce(
        (s, r) => s + r.candidate_gross_with_equal_line_delivery_pence,
        0,
      ),
      unrounded_reported_product_delivery_pence: {
        numerator: String(knownDelivery.num),
        denominator: String(knownDelivery.den),
      },
      candidate_omitted_merchandise_plus_delivery_pence: round(
        add(
          { num: BigInt(nativeTotal - knownGross), den: 1n },
          { num: -knownDelivery.num, den: knownDelivery.den },
        ),
      ),
    },
    refunds: {
      refunded_state_orders: fullCount,
      refunded_state_cumulative_refunds: fullRefund,
      other_state_orders_with_refunds: partialCount,
      other_state_cumulative_refunds: partialRefund,
      total: fullRefund + partialRefund,
      posting_dates_available: false,
      merchandise_delivery_allocation_available: false,
    },
    products: compared,
    decision:
      "Product counts include the whole captured cohort, not dispatched-only eligible orders. Product-report scope excludes native products; delivery allocation is a near-exact diagnostic explanation, with remaining penny residuals retained. Obtain source report scope/rounding and dated refund ledger before any net reporting.",
  };
}
module.exports = { investigate };
