// Canonical Shopify Analytics contract. No legacy revenue aliases or tax inference.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ShopifyFinance = factory();
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const VERSION = "shopify-analytics-v1";
  const MONEY = [
    "gross_sales",
    "discounts",
    "sales_reversals",
    "net_sales",
    "shipping_charges",
    "taxes",
    "total_sales",
  ];
  const ADDITIVE = [...MONEY, "orders"];
  const LABELS = {
    gross_sales: "Gross merchandise sales",
    discounts: "Discounts",
    sales_reversals: "Sales reversals",
    net_sales: "Net merchandise sales",
    shipping_charges: "Shipping charges",
    taxes: "Taxes",
    total_sales: "Shopify total sales",
    orders: "Shopify orders",
    average_order_value: "Shopify-reported AOV",
    net_aov: "Net merchandise AOV",
  };
  const DEFINITIONS = {
    gross_sales:
      "Product sales before discounts and reversals; excludes shipping and taxes.",
    discounts:
      "Native signed discounts; applied exactly as Shopify reports them.",
    sales_reversals:
      "Native signed reversals, including returns and cancellations, on the date Shopify records the adjustment.",
    net_sales:
      "Gross merchandise sales plus signed discounts and sales reversals; excludes shipping and taxes. Proposed management default, accountant mapping pending.",
    shipping_charges:
      "Native shipping charges after shipping discounts and reversals; excludes taxes.",
    taxes:
      "Actual Shopify-reported taxes, including adjustments. Never inferred using a flat VAT rate.",
    total_sales:
      "Original Shopify total sales, including shipping, taxes and any additional native components.",
    orders:
      "Native orders on order date. Shopify includes pending, unpaid and cancelled orders; excludes test and deleted orders. Never summed across product groups.",
    average_order_value:
      "Original Shopify-reported AOV for this exact interval, before post-order adjustments. Never an average of daily or monthly AOVs.",
    net_aov:
      "Net merchandise sales divided by native orders for the whole selected interval; null when orders are zero.",
  };
  function minor(value) {
    if (value == null || value === "") return null;
    const s = String(value);
    if (!/^-?\d+(\.\d{1,2})?$/.test(s))
      throw Error("Invalid money precision: " + s);
    const neg = s[0] === "-";
    const [a, b = ""] = s.replace(/^-/, "").split(".");
    const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
    if (!Number.isSafeInteger(n)) throw Error("Money exceeds safe precision");
    return neg ? -n : n;
  }
  function day(s) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
      new Date(s + "T00:00:00Z").toISOString().slice(0, 10) !== s
    )
      throw Error("Invalid reporting date");
    return s;
  }
  function next(s, n = 1) {
    const d = new Date(day(s) + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function sum(rows, key) {
    return rows.length && rows.every((r) => r[key] != null)
      ? rows.reduce((n, r) => n + r[key], 0)
      : null;
  }
  function select(snapshot, start, end, store = snapshot.store.domain) {
    day(start);
    day(end);
    if (start > end) throw Error("Start follows end");
    if (store !== snapshot.store.domain)
      throw Error("Store does not match source");
    const rows = snapshot.days.filter((r) => r.day >= start && r.day <= end),
      seen = new Set(rows.map((r) => r.day));
    let missing = 0;
    for (let d = start; d <= end; d = next(d)) if (!seen.has(d)) missing++;
    const result = {
      start,
      end,
      endExclusive: next(end),
      store,
      currency: snapshot.store.currency,
      timezone: snapshot.store.timezone,
      snapshot_id: snapshot.id,
      definition: VERSION,
      missingDays: missing,
      status: missing ? "missing" : "actual",
      reconciliation_status:
        "native-aggregate-verified; legacy-order-variance-open",
      warnings: [],
    };
    for (const k of ADDITIVE) result[k] = missing ? null : sum(rows, k);
    if (ADDITIVE.some((k) => result[k] == null)) result.status = "missing";
    const native = snapshot.periods.find(
      (r) => r.start === start && r.end === end,
    );
    result.average_order_value =
      result.status === "actual" && native ? native.average_order_value : null;
    result.net_aov =
      result.net_sales != null && result.orders > 0
        ? result.net_sales / 100 / result.orders
        : null;
    result.component_residual =
      result.total_sales != null &&
      ["net_sales", "shipping_charges", "taxes"].every((k) => result[k] != null)
        ? result.total_sales -
          result.net_sales -
          result.shipping_charges -
          result.taxes
        : null;
    if (result.status !== "actual")
      result.warnings.push(
        "Incomplete source coverage: financial totals and comparisons are unavailable.",
      );
    if (result.average_order_value == null)
      result.warnings.push(
        "Native AOV unavailable for this exact interval; capture a native period query.",
      );
    if (result.component_residual)
      result.warnings.push(
        "Total includes an unexplained component residual; review before publication.",
      );
    return result;
  }
  function products(snapshot, start, end, metric) {
    if (!MONEY.includes(metric))
      throw Error("Product measure must be additive money");
    const report = select(snapshot, start, end);
    if (report.status !== "actual")
      return { rows: [], residual: null, status: "missing" };
    const groups = new Map();
    for (const r of snapshot.products) {
      if (r.day < start || r.day > end) continue;
      const title = r.product_title || "Unassigned / non-product adjustments";
      const prev = groups.get(title);
      groups.set(
        title,
        prev === null || r[metric] == null ? null : (prev || 0) + r[metric],
      );
    }
    const rows = [...groups]
      .map(([title, value]) => ({ title, value }))
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    const total = rows.every((r) => r.value != null)
      ? rows.reduce((n, r) => n + r.value, 0)
      : null;
    return {
      rows,
      residual: total == null ? null : report[metric] - total,
      status: total === report[metric] ? "reconciled" : "unreconciled",
    };
  }
  function months(snapshot, start, end) {
    const rows = [];
    for (let d = start; d <= end; ) {
      const dt = new Date(d + "T00:00:00Z");
      const last = new Date(
        Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0),
      )
        .toISOString()
        .slice(0, 10);
      const e = last < end ? last : end;
      rows.push(select(snapshot, d, e));
      d = next(e);
    }
    return rows;
  }
  // Both dashboard entry points deliberately use the same projection and contract.
  const growthReport = select,
    rorReport = select;
  return {
    VERSION,
    MONEY,
    ADDITIVE,
    LABELS,
    DEFINITIONS,
    minor,
    day,
    next,
    select,
    growthReport,
    rorReport,
    products,
    months,
  };
});
