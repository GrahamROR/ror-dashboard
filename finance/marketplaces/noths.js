// Investigation only: preserves native financial fields without defining verified net sales.
"use strict";
const { londonDay } = require("./collect.js");
function money(v) {
  if (
    !v ||
    v.currency?.iso_code !== "GBP" ||
    v.currency?.subunit_to_unit !== 100 ||
    !Number.isSafeInteger(v.cents)
  )
    throw Error("Missing/unsupported NOTHS money");
  return v.cents;
}
function inspect(rows, controls) {
  const ids = new Set(),
    months = {};
  for (const r of rows) {
    if (!r.id || ids.has(String(r.id)))
      throw Error("Duplicate/missing NOTHS order");
    ids.add(String(r.id));
    const month = londonDay(r.placed_at).slice(0, 7);
    if (!Object.hasOwn(controls.monthly_gross, month))
      throw Error("NOTHS order outside report period");
    if (!r.state || !r.items?.length || !r.financials)
      throw Error("Missing NOTHS financial evidence");
    const m = (months[month] ||= {
      orders: 0,
      item_gross: 0,
      delivery: 0,
      order_total: 0,
      discounts: 0,
      refund_total: 0,
      commission_gross: 0,
      listing_total_with_discount: 0,
      tax_identity_exceptions: 0,
      tax_identity_residual: 0,
      states: {},
    });
    const state = (m.states[r.state] ||= {
      orders: 0,
      item_gross: 0,
      order_total: 0,
      refund_total: 0,
    });
    const item = r.items.reduce((s, i) => s + money(i.listing_total_gross), 0),
      order = money(r.order_total),
      refund = money(r.refund_total);
    for (const triple of Object.values(r.financials)) {
      if (triple?.gross && triple.net && triple.vat) {
        const delta =
          money(triple.gross) - money(triple.net) - money(triple.vat);
        if (delta) {
          m.tax_identity_exceptions++;
          m.tax_identity_residual += delta;
        }
      }
    }
    m.orders++;
    state.orders++;
    m.item_gross += item;
    state.item_gross += item;
    m.delivery += money(r.delivery_total);
    m.order_total += order;
    state.order_total += order;
    m.refund_total += refund;
    state.refund_total += refund;
    m.discounts += money(r.financials.purchase_discount.gross);
    m.commission_gross += money(r.financials.commission.gross);
    m.listing_total_with_discount += money(
      r.financials.listing_total_with_discount.gross,
    );
  }
  for (const [month, m] of Object.entries(months)) {
    m.native_report_gross = controls.monthly_gross[month];
    m.item_plus_delivery = m.item_gross + m.delivery;
    m.unresolved_native_gross_difference =
      m.native_report_gross - m.item_plus_delivery;
  }
  const fields = [
    "orders",
    "item_gross",
    "delivery",
    "order_total",
    "discounts",
    "refund_total",
    "commission_gross",
    "listing_total_with_discount",
    "native_report_gross",
    "item_plus_delivery",
    "unresolved_native_gross_difference",
    "tax_identity_exceptions",
    "tax_identity_residual",
  ];
  const totals = Object.fromEntries(
    fields.map((k) => [k, Object.values(months).reduce((s, m) => s + m[k], 0)]),
  );
  const states = {};
  for (const m of Object.values(months))
    for (const [state, values] of Object.entries(m.states)) {
      const aggregate = (states[state] ||= {
        orders: 0,
        item_gross: 0,
        order_total: 0,
        refund_total: 0,
      });
      for (const [k, v] of Object.entries(values)) aggregate[k] += v;
    }
  return {
    states,
    status: "unreconciled",
    months: Object.fromEntries(Object.entries(months).sort()),
    totals,
    product_report_gross: controls.product_report_gross,
    product_vs_order_total_difference:
      controls.product_report_gross - totals.order_total,
    decision:
      "No verified NOTHS revenue, eligible-order definition or refund adjustment promoted. Imported gross remains unchanged.",
  };
}
module.exports = { inspect, money };
