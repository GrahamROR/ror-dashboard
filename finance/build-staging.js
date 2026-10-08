// Read-only source transformation. Only the staging manifest is mutable.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const F = require("./contract");
const ROOT = path.join(__dirname, "staging");
const hash = (x) => crypto.createHash("sha256").update(x).digest("hex");
function table(raw) {
  if (
    !raw.columns ||
    !Array.isArray(raw.rows) ||
    raw.rowCount !== raw.rows.length
  )
    throw Error("Invalid/truncated source table");
  const limit = /LIMIT (\d+)/.exec(raw.query);
  if (limit && raw.rows.length >= +limit[1])
    throw Error("Source hit row cap; partition or paginate");
  return raw.rows.map((row) => {
    if (row.length !== raw.columns.length) throw Error("Invalid row width");
    return Object.fromEntries(raw.columns.map((c, i) => [c.name, row[i]]));
  });
}
function fact(row, orders = true) {
  const out = {};
  for (const k of F.MONEY) out[k] = F.minor(row[k]);
  if (orders) {
    if (row.orders == null || row.orders === "") out.orders = null;
    else if (!/^\d+$/.test(String(row.orders)))
      throw Error("Invalid order count");
    else out.orders = Number(row.orders);
  }
  return out;
}
function build(sourceDir) {
  const files = fs
    .readdirSync(sourceDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const raw = {},
    sources = [];
  for (const name of files) {
    const bytes = fs.readFileSync(path.join(sourceDir, name));
    raw[name] = JSON.parse(bytes);
    sources.push({
      file: name,
      sha256: hash(bytes),
      query: raw[name].query || null,
      retrieved_at: raw[name].retrieved_at,
      transport: raw[name].transport,
      ...(raw[name].partitions
        ? { partitions: raw[name].partitions, query_executed: false }
        : {}),
    });
  }
  const shop = raw["shop.json"].data.shop;
  if (shop.currencyCode !== "GBP" || shop.ianaTimezone !== "Europe/London")
    throw Error("Unapproved currency/timezone");
  for (const r of Object.values(raw))
    if (r.shopDomain && r.shopDomain !== shop.myshopifyDomain)
      throw Error("Mixed stores");
  const days = table(raw["daily.json"]).map((r) => ({
    day: F.day(r.day),
    ...fact(r),
  }));
  if (new Set(days.map((r) => r.day)).size !== days.length)
    throw Error("Duplicate source day");
  days.sort((a, b) => a.day.localeCompare(b.day));
  const span = /SINCE (\d{4}-\d{2}-\d{2}) UNTIL (\d{4}-\d{2}-\d{2})/.exec(
    raw["daily.json"].query,
  );
  if (!span) throw Error("Explicit dates required");
  const periods = [];
  function period(start, end, r) {
    const aov =
      r.average_order_value == null || r.average_order_value === ""
        ? null
        : Number(r.average_order_value);
    if (aov !== null && !Number.isFinite(aov))
      throw Error("Invalid native AOV");
    periods.push({ start, end, ...fact(r), average_order_value: aov });
  }
  table(raw["daily.json"]).forEach((r) => period(r.day, r.day, r));
  table(raw["monthly.json"]).forEach((r) => {
    const d = new Date(r.month + "T00:00:00Z");
    let end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    period(
      r.month > span[1] ? r.month : span[1],
      end < span[2] ? end : span[2],
      r,
    );
  });
  for (const [name, r] of Object.entries(raw))
    if (name === "fy26.json" || name.startsWith("period-")) {
      const m = /SINCE (\d{4}-\d{2}-\d{2}) UNTIL (\d{4}-\d{2}-\d{2})/.exec(
        r.query,
      );
      const rows = table(r);
      if (!m || rows.length !== 1) throw Error("Invalid period control");
      period(m[1], m[2], rows[0]);
    }
  const products = table(raw["products-daily.json"]).map((r) => ({
    day: F.day(r.day),
    product_title: r.product_title || "",
    ...fact(r, false),
  }));
  if (
    new Set(products.map((r) => JSON.stringify([r.day, r.product_title])))
      .size !== products.length
  )
    throw Error("Duplicate product/day");
  const snapshot = {
    schema: F.VERSION,
    store: {
      id: shop.id,
      domain: shop.myshopifyDomain,
      currency: shop.currencyCode,
      timezone: shop.ianaTimezone,
      taxesIncluded: shop.taxesIncluded,
    },
    coverage: { start: span[1], end: span[2] },
    policies: {
      counting:
        "Shopify native sales.orders; order date; no product count summation",
      adjustment: "Shopify native sales event/adjustment date",
      accounting:
        "Commercial reporting; source tax treatment retained, no accounting-turnover assertion",
      money:
        "Integer GBP pennies; native AOV retained at returned decimal precision",
      units: "Unavailable; not inferred",
    },
    sources,
    days,
    periods,
    products,
  };
  // Independent native period reports must agree with daily sums, never balance to benchmarks.
  for (const p of periods) {
    const a = F.select({ ...snapshot, id: "pending" }, p.start, p.end);
    for (const k of F.ADDITIVE)
      if (a[k] !== p[k])
        throw Error(
          `Native reconciliation failed: ${p.start} ${p.end} ${k}: ${a[k]} != ${p[k]}`,
        );
  }
  for (const d of days)
    if (
      d.net_sales != null &&
      ["gross_sales", "discounts", "sales_reversals"].every(
        (k) => d[k] != null,
      ) &&
      d.net_sales !== d.gross_sales + d.discounts + d.sales_reversals
    )
      throw Error("Native net-sales bridge failed: " + d.day);
  for (const p of periods.filter((p) => p.start !== p.end))
    for (const metric of F.MONEY)
      if (
        F.products({ ...snapshot, id: "pending" }, p.start, p.end, metric)
          .status !== "reconciled"
      )
        throw Error("Product reconciliation failed: " + p.start + " " + metric);
  snapshot.id = hash(JSON.stringify(snapshot));
  return snapshot;
}
function publish(snapshot, root = ROOT) {
  const { id, ...body } = snapshot;
  if (hash(JSON.stringify(body)) !== id)
    throw Error("Invalid snapshot identity");
  fs.mkdirSync(path.join(root, "snapshots"), { recursive: true });
  const bytes = JSON.stringify(snapshot);
  const file = `snapshots/${snapshot.id}.json`;
  const dest = path.join(root, file);
  if (fs.existsSync(dest) && fs.readFileSync(dest, "utf8") !== bytes)
    throw Error("Immutable snapshot conflict");
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, bytes, { flag: "wx" });
  const manifestPath = path.join(root, "manifest.json");
  const old = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath))
    : null;
  const manifest = {
    snapshot_id: snapshot.id,
    file,
    sha256: hash(bytes),
    previous_snapshot_id:
      old && old.snapshot_id !== snapshot.id
        ? old.snapshot_id
        : old?.previous_snapshot_id || null,
    approval: "STAGING ONLY — publication and accounting approval pending",
  };
  fs.writeFileSync(
    manifestPath + ".tmp",
    JSON.stringify(manifest, null, 2) + "\n",
  );
  fs.renameSync(manifestPath + ".tmp", manifestPath);
  return manifest;
}
if (require.main === module) {
  const snapshot = build(process.argv[2] || path.join(ROOT, "source"));
  console.log(JSON.stringify(publish(snapshot)));
}
module.exports = { build, publish, table, fact, hash, ROOT };
