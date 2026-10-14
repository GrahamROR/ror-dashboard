"use strict";
const F = require("../contract.js");
const MP = require("./contract.js");
const crypto = require("node:crypto");
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
function csv(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") quoted = !quoted;
      else throw Error("Malformed CSV quote");
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (c === "\n") {
        if (row.some((x) => x !== "")) rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (quoted) throw Error("Unterminated CSV quote");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  if (!rows.length) throw Error("Empty CSV");
  const headers = rows.shift();
  headers[0] = headers[0].replace(/^\uFEFF/, "");
  if (new Set(headers).size !== headers.length)
    throw Error("Duplicate CSV headers");
  return rows.map((r) => {
    if (r.length !== headers.length) throw Error("CSV column count mismatch");
    return Object.fromEntries(headers.map((h, i) => [h, r[i]]));
  });
}
function date(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (!m) throw Error("Invalid Etsy report date");
  const d = `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  F.day(d);
  return d;
}
function money(r, k) {
  const n = F.minor(r[k]);
  if (n == null) throw Error("Missing financial field: " + k);
  return n;
}
function unique(rows, key) {
  const ids = new Set();
  for (const r of rows) {
    if (!/^\d+$/.test(r[key] || "")) throw Error("Missing/invalid " + key);
    if (ids.has(r[key])) throw Error("Duplicate " + key);
    ids.add(r[key]);
  }
  return ids;
}
const fields = [
  "gross_sales",
  "discounts",
  "net_sales",
  "total_sales",
  "shipping",
  "tax",
  "orders",
];
function sum(rows) {
  return Object.fromEntries(
    fields.map((k) => [k, rows.reduce((s, r) => s + r[k], 0)]),
  );
}
function buildMonth(month, soldText, paymentText, control, nativeReceipts) {
  if (
    !/^\d{4}-\d{2}$/.test(month) ||
    !control ||
    control.complete !== true ||
    control.currency !== "GBP" ||
    control.timezone !== "Europe/London"
  )
    throw Error("Complete GBP/London source controls required");
  const sold = csv(soldText),
    payments = csv(paymentText),
    ids = unique(sold, "Order ID");
  unique(payments, "Payment ID");
  const payIds = unique(payments, "Order ID");
  if (!(nativeReceipts instanceof Map))
    throw Error("Complete native receipt evidence required");
  for (const [id, native] of nativeReceipts) {
    if (!Number.isInteger(native.create_timestamp))
      throw Error("Missing native timestamp");
    const nativeDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(native.create_timestamp * 1000));
    if (nativeDay.startsWith(month) && !payIds.has(id))
      throw Error("Native receipt missing paired financial evidence");
  }
  let partial = 0,
    fees = 0,
    paymentGross = 0,
    refunds = 0,
    excluded = 0,
    residualCount = 0,
    residual = 0;
  for (const p of payments) {
    if (
      p.Currency !== "GBP" ||
      p["Listing Currency"] !== "GBP" ||
      Number(p["Exchange Rate"]) !== 1
    )
      throw Error("Unsupported payment currency/exchange");
    if (date(p["Order Date"]).slice(0, 7) !== month)
      throw Error("Payment outside declared month");
    if (p.Status !== "SETTLED") throw Error("Unverified payment status");
    const refund = money(p, "Refund Amount"),
      gross = money(p, "Gross Amount");
    fees += money(p, "Fees");
    paymentGross += gross;
    refunds += refund;
    if (refund < 0 || gross < 0) throw Error("Invalid payment amount");
    if (!ids.has(p["Order ID"])) {
      if (nativeReceipts?.get(p["Order ID"])?.status !== "Canceled")
        throw Error("Excluded payment lacks native cancellation evidence");
      if (refund === 0 || refund < money(p, "Listing Amount"))
        throw Error("Unexplained payment absent from Sold Orders");
      excluded++;
    } else if (refund > 0) {
      if (nativeReceipts?.get(p["Order ID"])?.status !== "Partially Refunded")
        throw Error("Partial refund lacks native eligibility evidence");
      partial++;
    }
  }
  const financial = sold.map((r) => {
    if (r.Currency !== "GBP") throw Error("Unsupported Sold Orders currency");
    let d = date(r["Sale Date"]);
    const native = nativeReceipts?.get(r["Order ID"]);
    if (!native)
      throw Error(
        "Native receipt timestamp/financial evidence required for London dates",
      );
    if (!Number.isInteger(native.create_timestamp))
      throw Error("Missing native receipt timestamp");
    d = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(native.create_timestamp * 1000));
    if (d.slice(0, 7) !== month)
      throw Error("Sold order outside declared month");
    if (!payIds.has(r["Order ID"]))
      throw Error("Sold order missing payment evidence");
    if (r.Status && !["Completed", "complete"].includes(r.Status))
      throw Error("Unverified Sold Order status");
    const gross = money(r, "Order Value"),
      discount = money(r, "Discount Amount"),
      shipping = money(r, "Shipping"),
      tax = money(r, "Sales Tax"),
      total = money(r, "Order Total");
    if (
      gross < 0 ||
      discount < 0 ||
      discount > gross ||
      shipping < 0 ||
      tax < 0 ||
      total < 0
    )
      throw Error("Invalid Sold Orders amount");
    for (const [key, n] of [
      ["total_price", gross],
      ["discount_amt", discount],
      ["grandtotal", total],
    ])
      if (
        native[key]?.currency_code !== "GBP" ||
        native[key]?.divisor !== 100 ||
        native[key]?.amount !== n
      )
        throw Error("Native receipt/CSV financial mismatch");
    if (
      !native.is_paid ||
      !["Completed", "Partially Refunded"].includes(native.status)
    )
      throw Error("Native receipt eligibility mismatch");
    const net = gross - discount;
    const delta = total - net - shipping - tax;
    if (delta) {
      residualCount++;
      residual += delta;
    }
    return {
      date: d,
      gross_sales: gross,
      discounts: discount,
      net_sales: net,
      total_sales: total,
      shipping,
      tax,
      orders: 1,
    };
  });
  const totals = sum(financial);
  for (const k of fields)
    if (control[k] !== totals[k])
      throw Error("Etsy source-control mismatch: " + month + " " + k);
  for (const [k, n] of Object.entries({
    payment_records: payments.length,
    excluded,
    partial,
    residual_count: residualCount,
    residual,
    fees,
    payment_gross: paymentGross,
    refunds,
  }))
    if (control[k] != null && control[k] !== n)
      throw Error("Etsy evidence-control mismatch: " + month + " " + k);
  const daily = [];
  const last = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0))
    .toISOString()
    .slice(0, 10);
  for (let d = month + "-01"; d <= last; d = F.next(d))
    daily.push({
      date: d,
      ...sum(financial.filter((r) => r.date === d)),
      completeness: "validated",
    });
  return {
    month,
    ...totals,
    daily,
    audit: {
      payment_records: payments.length,
      excluded,
      partial,
      residual_count: residualCount,
      residual,
      fees,
      payment_gross: paymentGross,
      refunds,
    },
    source: {
      sold_sha256: hash(soldText),
      payments_sha256: hash(paymentText),
      controls_sha256: hash(JSON.stringify(control)),
    },
    validation:
      "paired CSV + independent source controls + native London timestamps",
    currency: "GBP",
    timezone: "Europe/London",
  };
}
function snapshot(months) {
  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
  if (new Set(sorted.map((r) => r.month)).size !== sorted.length)
    throw Error("Duplicate source months");
  return {
    schema: MP.VERSION,
    currency: "GBP",
    timezone: "Europe/London",
    channels: {
      etsy: {
        policy: "etsy-sold-orders-stats-v1",
        refresh:
          "controlled paired CSV import; API candidates never auto-promoted",
        months: sorted.map(({ daily, ...r }) => r),
        daily: sorted.flatMap((r) => r.daily),
      },
    },
  };
}
module.exports = { csv, date, buildMonth, snapshot, hash, fields };
