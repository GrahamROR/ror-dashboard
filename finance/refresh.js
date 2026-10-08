// Staging-only refresh, using the existing Shopify credentials and fetch entry point.
// Every retained date is re-queried: late adjustments revise a new snapshot, never old facts.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const F = require("./contract"),
  B = require("./build-staging"),
  { request, QUERY } = require("./collect");
const ROOT = B.ROOT;
function ranges(start, end) {
  const out = [];
  for (let d = start; d <= end; ) {
    const close = d.slice(0, 4) + "-12-31",
      e = close < end ? close : end;
    out.push({ start: d, end: e });
    d = F.next(e);
  }
  return out;
}
function endYesterday(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return F.next(today, -1);
}
async function accessToken(env, transport = fetch) {
  if (env.SHOPIFY_ACCESS_TOKEN) return env.SHOPIFY_ACCESS_TOKEN;
  const shop = env.SHOPIFY_STORE?.replace(/\.myshopify\.com$/, "");
  if (
    !/^[a-z0-9-]+$/.test(shop || "") ||
    !env.SHOPIFY_CLIENT_ID ||
    !env.SHOPIFY_CLIENT_SECRET
  )
    throw Error(
      "Existing Shopify client credentials are required for staging refresh",
    );
  const r = await transport(
    `https://${shop}.myshopify.com/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: env.SHOPIFY_CLIENT_ID,
        client_secret: env.SHOPIFY_CLIENT_SECRET,
      }),
    },
  );
  if (!r.ok) throw Error("Shopify token request failed: HTTP " + r.status);
  const data = await r.json();
  if (!data.access_token) throw Error("Shopify token missing");
  return data.access_token;
}
async function capture({ domain, token, start, end, query, transport }) {
  const data = await request(domain, token, QUERY, { query }, transport);
  const r = data.shopifyqlQuery;
  if (!r?.tableData || r.parseErrors?.length)
    throw Error("Native report failed; staging snapshot retained");
  const { columns, rows } = r.tableData;
  const raw = {
    query,
    columns,
    rows: rows.map((row) =>
      Array.isArray(row) ? row : columns.map((c) => row[c.name]),
    ),
    rowCount: rows.length,
    shopDomain: domain,
    retrieved_at: new Date().toISOString(),
    transport: "Shopify Admin GraphQL 2026-10",
  };
  B.table(raw);
  return raw;
}
async function captureHistory({
  domain,
  token,
  start,
  end,
  root = ROOT,
  transport = fetch,
}) {
  F.day(start);
  F.day(end);
  if (start > end) throw Error("Invalid capture interval");
  const metadata = await request(
    domain,
    token,
    "query { shop { id myshopifyDomain currencyCode ianaTimezone taxesIncluded } }",
    {},
    transport,
  );
  if (
    metadata.shop.myshopifyDomain !== domain ||
    metadata.shop.currencyCode !== "GBP" ||
    metadata.shop.ianaTimezone !== "Europe/London"
  )
    throw Error("Unapproved source identity/currency/timezone");
  const output = {
    "shop.json": {
      data: metadata,
      retrieved_at: new Date().toISOString(),
      transport: "Shopify Admin GraphQL 2026-10",
    },
  };
  const fields = [...F.ADDITIVE, "average_order_value"].join(", "),
    partitioned = {
      "daily.json": [],
      "monthly.json": [],
      "products-daily.json": [],
    };
  for (const span of ranges(start, end)) {
    const bounds = ` SINCE ${span.start} UNTIL ${span.end}`;
    const queries = {
      "daily.json": `FROM sales SHOW ${fields} TIMESERIES day${bounds} LIMIT 2000`,
      "monthly.json": `FROM sales SHOW ${fields} TIMESERIES month${bounds} LIMIT 2000`,
      "products-daily.json": `FROM sales SHOW ${F.MONEY.join(", ")} GROUP BY day, product_title${bounds} ORDER BY day ASC, product_title ASC LIMIT 25000`,
    };
    for (const [name, query] of Object.entries(queries))
      partitioned[name].push(
        await capture({ domain, token, query, transport }),
      );
    output[`period-calendar-${span.start}.json`] = await capture({
      domain,
      token,
      query: `FROM sales SHOW ${fields}${bounds}`,
      transport,
    });
  }
  // Native FY controls keep native AOV exact across calendar-year partitions.
  for (
    let y = Number(start.slice(0, 4));
    y <= Number(end.slice(0, 4)) + 1;
    y++
  ) {
    const a = `${y - 1}-08-01`,
      b = `${y}-07-31`,
      s = a > start ? a : start,
      e = b < end ? b : end;
    if (s <= e)
      output[`period-fy-${y}.json`] = await capture({
        domain,
        token,
        query: `FROM sales SHOW ${fields} SINCE ${s} UNTIL ${e}`,
        transport,
      });
  }
  for (const [name, parts] of Object.entries(partitioned)) {
    if (
      parts.some(
        (p) => JSON.stringify(p.columns) !== JSON.stringify(parts[0].columns),
      )
    )
      throw Error("Source schema changed between partitions");
    output[name] = {
      ...parts[0],
      query: `UNION OF VALIDATED PARTITIONS SINCE ${start} UNTIL ${end}`,
      query_executed: false,
      transport: "Validated union of read-only Shopify reports",
      rows: parts.flatMap((p) => p.rows),
      rowCount: parts.reduce((n, p) => n + p.rowCount, 0),
      retrieved_at: parts.at(-1).retrieved_at,
      partitions: parts.map((p) => ({
        query: p.query,
        retrieved_at: p.retrieved_at,
        sha256: B.hash(JSON.stringify(p)),
        rowCount: p.rowCount,
      })),
    };
  }
  const dir = path.join(root, "source", "refresh-" + crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, raw] of Object.entries(output))
    fs.writeFileSync(path.join(dir, name), JSON.stringify(raw));
  return dir;
}
function status(root, value) {
  fs.mkdirSync(root, { recursive: true });
  const dest = path.join(root, "refresh-status.json");
  fs.writeFileSync(dest + ".tmp", JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(dest + ".tmp", dest);
}
async function refresh({
  root = ROOT,
  sourceDir = null,
  env = process.env,
  now = new Date(),
  transport = fetch,
} = {}) {
  // Refuse export roots. Only a dedicated finance staging transaction may publish.
  const resolved = path.resolve(root);
  if (
    [
      path.resolve(__dirname, ".."),
      path.resolve(__dirname, "../dashboard2"),
    ].includes(resolved)
  )
    throw Error("Production export roots are forbidden");
  const previous = fs.existsSync(path.join(root, "manifest.json"))
    ? JSON.parse(fs.readFileSync(path.join(root, "manifest.json")))
    : null;
  try {
    let dir = sourceDir;
    if (!dir) {
      const end = endYesterday(now),
        start = "2024-01-01";
      const token = await accessToken(env, transport);
      const domain =
        env.SHOPIFY_DOMAIN ||
        env.SHOPIFY_STORE?.replace(/\.myshopify\.com$/, "") + ".myshopify.com";
      dir = await captureHistory({
        domain,
        token,
        start,
        end,
        root,
        transport,
      });
    }
    const snapshot = B.build(dir);
    const verification = {
      start: snapshot.coverage.start,
      end: snapshot.coverage.end,
      days: snapshot.days.length,
      nativeControls: snapshot.periods.filter((p) => p.start !== p.end).length,
      source_capture: path.basename(dir),
    };
    // All checks complete before the atomic pointer changes. Failed batches leave old immutable history intact.
    const manifest = B.publish(snapshot, root);
    status(root, {
      status: "success",
      attempted_at: now.toISOString(),
      snapshot_id: snapshot.id,
      previous_snapshot_id: previous?.snapshot_id || null,
      verification,
    });
    return { manifest, verification };
  } catch (error) {
    status(root, {
      status: "failed",
      attempted_at: now.toISOString(),
      snapshot_id: previous?.snapshot_id || null,
      error: error.message,
    });
    throw error;
  }
}
if (require.main === module) {
  const index = process.argv.indexOf("--from-capture");
  refresh({ sourceDir: index >= 0 ? process.argv[index + 1] : null })
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
module.exports = { refresh, captureHistory, accessToken, ranges, endYesterday };
