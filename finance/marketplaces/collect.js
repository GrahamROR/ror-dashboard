// Read-only native candidates. Never refreshes OAuth tokens, touches StockHub or promotes data.
"use strict";
const fs = require("node:fs"),
  path = require("node:path");
function londonDay(timestamp) {
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) throw Error("Missing source timestamp");
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function etsyMoney(v) {
  if (
    !v ||
    v.currency_code !== "GBP" ||
    v.divisor !== 100 ||
    !Number.isSafeInteger(v.amount)
  )
    throw Error("Missing/unsupported Etsy native financial field");
}
function nothsMoney(v) {
  if (
    !v ||
    v.currency?.iso_code !== "GBP" ||
    v.currency?.subunit_to_unit !== 100 ||
    !Number.isSafeInteger(v.cents)
  )
    throw Error("Missing/unsupported NOTHS native financial field");
}
function etsyReceipt(x) {
  for (const k of [
    "grandtotal",
    "subtotal",
    "total_price",
    "total_shipping_cost",
    "total_tax_cost",
    "total_vat_cost",
    "discount_amt",
  ])
    etsyMoney(x[k]);
  if (
    !x.status ||
    typeof x.is_paid !== "boolean" ||
    !Array.isArray(x.refunds) ||
    !Array.isArray(x.transactions)
  )
    throw Error("Missing Etsy eligibility/refund evidence");
  for (const f of x.refunds) etsyMoney(f.amount);
  for (const t of x.transactions) {
    etsyMoney(t.price);
    if (!Number.isSafeInteger(t.quantity) || t.quantity < 1)
      throw Error("Missing Etsy transaction quantity");
  }
  return {
    receipt_id: String(x.receipt_id),
    create_timestamp: x.create_timestamp,
    update_timestamp: x.update_timestamp,
    status: x.status,
    is_paid: x.is_paid,
    grandtotal: x.grandtotal,
    subtotal: x.subtotal,
    total_price: x.total_price,
    total_shipping_cost: x.total_shipping_cost,
    total_tax_cost: x.total_tax_cost,
    total_vat_cost: x.total_vat_cost,
    discount_amt: x.discount_amt,
    transactions: (x.transactions || []).map((t) => ({
      quantity: t.quantity,
      price: t.price,
    })),
    refunds: (x.refunds || []).map((f) => ({ amount: f.amount })),
  };
}
function nothsOrder(x) {
  for (const k of ["order_total", "delivery_total", "refund_total"])
    nothsMoney(x[k]);
  if (!x.state || !x.financials || !Array.isArray(x.items))
    throw Error("Missing NOTHS financial evidence");
  for (const k of [
    "purchase_discount",
    "commission",
    "listing_total_with_discount",
  ])
    for (const component of ["gross", "net", "vat"])
      nothsMoney(x.financials[k]?.[component]);
  for (const i of x.items) nothsMoney(i.listing_total_gross);
  const financials = {};
  for (const [k, v] of Object.entries(x.financials || {})) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      v.gross &&
      v.net &&
      v.vat
    )
      financials[k] = v;
    else if (/rate$/.test(k)) financials[k] = v;
  }
  return {
    id: x.id,
    state: x.state,
    placed_at: x.placed_at,
    updated_at: x.updated_at,
    vat_liability: x.vat_liability,
    order_total: x.order_total,
    delivery_total: x.delivery_total,
    promotion_discount: x.promotion_discount,
    financials,
    refund_total: x.refund_total,
    items: (x.items || []).map((i) => ({
      id: i.id,
      quantity: i.quantity,
      listing_total_gross: i.listing_total_gross,
    })),
  };
}
async function collect({
  channel,
  start,
  end,
  env = process.env,
  fetcher = fetch,
  maxPages = 80,
}) {
  if (
    !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(start) ||
    !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(end) ||
    !Number.isFinite(Date.parse(start)) ||
    Date.parse(start) >= Date.parse(end)
  )
    throw Error("Explicit timestamp bounds required; end is exclusive");
  const rows = [],
    seen = new Set();
  let count = null,
    previous = Infinity,
    finished = false,
    pages = 0;
  if (!["etsy", "noths"].includes(channel)) throw Error("Unknown marketplace");
  if (
    channel === "etsy" &&
    [
      "ETSY_SHOP_ID",
      "ETSY_KEYSTRING",
      "ETSY_SHARED_SECRET",
      "ETSY_ACCESS_TOKEN",
    ].some((k) => !env[k])
  )
    throw Error("Missing Etsy read credentials; token management is external");
  if (channel === "noths" && !env.NOTHS_TOKEN)
    throw Error("Missing NOTHS read credentials");
  for (let offset = 0; pages < maxPages; ) {
    const limit = channel === "etsy" ? 100 : 250;
    const u = new URL(
      channel === "etsy"
        ? `https://openapi.etsy.com/v3/application/shops/${env.ETSY_SHOP_ID}/receipts`
        : "https://api.notonthehighstreet.com/api/v1/orders",
    );
    const params =
      channel === "etsy"
        ? {
            min_created: Math.floor(Date.parse(start) / 1000),
            max_created: Math.ceil(Date.parse(end) / 1000) - 1,
            limit,
            offset,
            sort_on: "created",
            sort_order: "asc",
          }
        : {
            token: env.NOTHS_TOKEN,
            per_page: limit,
            offset,
            sort: "placed_at",
            dir: "desc",
            include: "financials",
          };
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    let r;
    try {
      r = await fetcher(u, {
        method: "GET",
        headers:
          channel === "etsy"
            ? {
                "x-api-key": env.ETSY_KEYSTRING + ":" + env.ETSY_SHARED_SECRET,
                Authorization: "Bearer " + env.ETSY_ACCESS_TOKEN,
              }
            : {},
      });
    } catch {
      throw Error("Marketplace source connection failed");
    }
    if (!r.ok) throw Error("Marketplace native read failed HTTP " + r.status);
    const b = await r.json(),
      nextCount = channel === "etsy" ? b.count : b.query?.total,
      list = channel === "etsy" ? b.results : b.data;
    if (!Number.isInteger(nextCount) || !Array.isArray(list))
      throw Error("Missing native pagination metadata");
    if (count != null && count !== nextCount)
      throw Error("Native source count changed during collection");
    count = nextCount;
    pages++;
    for (const x of list) {
      const id = String(channel === "etsy" ? x.receipt_id : x.id),
        t =
          channel === "etsy"
            ? x.create_timestamp * 1000
            : Date.parse(x.placed_at);
      if (!/^\d+$/.test(id)) throw Error("Missing native order ID");
      if (!Number.isFinite(t)) throw Error("Missing native order timestamp");
      if (channel === "noths" && t > previous)
        throw Error("NOTHS source sorting changed");
      previous = t;
      if (channel === "noths" && t < Date.parse(start)) {
        finished = true;
        break;
      }
      if (t < Date.parse(start) || t >= Date.parse(end)) {
        if (channel === "etsy")
          throw Error("Receipt outside requested native scope");
        continue;
      }
      if (seen.has(id)) throw Error("Duplicate native order during pagination");
      seen.add(id);
      rows.push(channel === "etsy" ? etsyReceipt(x) : nothsOrder(x));
    }
    offset += list.length;
    if (channel === "etsy" && offset >= count) {
      finished = true;
      break;
    }
    if (channel === "noths" && (finished || offset >= count)) {
      finished = true;
      break;
    }
    if (!list.length) throw Error("Incomplete native pagination");
  }
  if (!finished) throw Error("Bounded source collection incomplete");
  return {
    channel,
    collected_at: new Date().toISOString(),
    start,
    end,
    count: channel === "etsy" ? count : rows.length,
    total_api_orders: count,
    pages,
    validation:
      "candidate; requires independent native report controls before promotion",
    rows,
  };
}
if (require.main === module) {
  const [channel, start, end, out] = process.argv.slice(2);
  const privateRoot = path.resolve("finance/local-data");
  if (!out || !path.resolve(out).startsWith(privateRoot + path.sep))
    throw Error("Candidate output must be under ignored finance/local-data");
  collect({ channel, start, end })
    .then((data) => {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
      console.log(
        JSON.stringify({
          channel,
          count: data.rows.length,
          pages: data.pages,
          validation: data.validation,
        }),
      );
    })
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
module.exports = { collect, londonDay, etsyReceipt, nothsOrder };
