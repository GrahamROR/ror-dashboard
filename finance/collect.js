// Read-only Admin API collector. Requires read_reports; never runs existing writers.
const fs = require("node:fs"),
  path = require("node:path");
const F = require("./contract"),
  { table, ROOT } = require("./build-staging");
const API_VERSION = "2026-10";
const QUERY =
  "query FinanceSource($query: String!) { shopifyqlQuery(query: $query) { tableData { columns { name dataType } rows } parseErrors } }";
const SHOP =
  "query { shop { id myshopifyDomain currencyCode ianaTimezone taxesIncluded } }";
async function request(
  domain,
  token,
  query,
  variables = {},
  transport = fetch,
  delay = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(domain) || !token)
    throw Error("Shop domain and access token required");
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await transport(
      `https://${domain}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query, variables }),
      },
    );
    if (response.status === 429) {
      await delay(1000 * 2 ** attempt);
      continue;
    }
    if (!response.ok)
      throw Error("Read-only Shopify request failed: HTTP " + response.status);
    const json = await response.json();
    if (json.errors?.some((e) => e.extensions?.code === "THROTTLED")) {
      await delay(1000 * 2 ** attempt);
      continue;
    }
    if (json.errors || !json.data)
      throw Error("Shopify GraphQL error; no staging pointer changed");
    return json.data;
  }
  throw Error("Shopify throttling retry limit; no staging pointer changed");
}
async function collect({ domain, token, start, end, run }, transport) {
  F.day(start);
  F.day(end);
  const length = (new Date(end) - new Date(start)) / 86400000 + 1;
  if (length < 1 || length > 1100)
    throw Error("Capture 1–1100 days per staging batch");
  if (!/^[a-zA-Z0-9_-]+$/.test(run)) throw Error("Invalid capture name");
  const target = path.join(ROOT, "source", run);
  if (fs.existsSync(target))
    throw Error("Capture already exists; raw evidence is immutable");
  const metadata = await request(domain, token, SHOP, {}, transport);
  const shop = metadata.shop;
  if (
    shop.myshopifyDomain !== domain ||
    shop.currencyCode !== "GBP" ||
    shop.ianaTimezone !== "Europe/London"
  )
    throw Error("Unapproved source identity, currency or timezone");
  const output = {
    "shop.json": {
      retrieved_at: new Date().toISOString(),
      transport: "Shopify Admin GraphQL " + API_VERSION,
      data: metadata,
    },
  };
  const fields = [...F.ADDITIVE, "average_order_value"].join(", "),
    bounds = ` SINCE ${start} UNTIL ${end}`;
  const queries = {
    "daily.json": `FROM sales SHOW ${fields} TIMESERIES day${bounds} LIMIT 2000`,
    "monthly.json": `FROM sales SHOW ${fields} TIMESERIES month${bounds} LIMIT 2000`,
    "period-selection.json": `FROM sales SHOW ${fields}${bounds}`,
    "products-daily.json": `FROM sales SHOW ${F.MONEY.join(", ")} GROUP BY day, product_title${bounds} ORDER BY day ASC, product_title ASC LIMIT 25000`,
  };
  for (const [name, query] of Object.entries(queries)) {
    const data = await request(domain, token, QUERY, { query }, transport);
    const r = data.shopifyqlQuery;
    if (r?.parseErrors?.length || !r?.tableData)
      throw Error("Invalid native report; capture aborted");
    const { columns, rows } = r.tableData;
    const normalized = rows.map((row) =>
      Array.isArray(row) ? row : columns.map((c) => row[c.name]),
    );
    const raw = {
      retrieved_at: new Date().toISOString(),
      transport: "Shopify Admin GraphQL " + API_VERSION,
      shopDomain: domain,
      query,
      columns,
      rows: normalized,
      rowCount: rows.length,
    };
    table(raw);
    output[name] = raw;
  }
  // All queries must succeed before exposing the capture. No pointer update here.
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = fs.mkdtempSync(
    path.join(path.dirname(target), ".capture-"),
  );
  try {
    for (const [name, data] of Object.entries(output))
      fs.writeFileSync(path.join(temporary, name), JSON.stringify(data));
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true });
  }
  return target;
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const option = (k) => args[args.indexOf(k) + 1];
  if (!["--since", "--until", "--capture"].every((k) => args.includes(k)))
    throw Error(
      "Use --since YYYY-MM-DD --until YYYY-MM-DD --capture NAME. Exact dates deliberately required, including closed-year refreshes.",
    );
  collect({
    domain: process.env.SHOPIFY_DOMAIN,
    token: process.env.SHOPIFY_ACCESS_TOKEN,
    start: option("--since"),
    end: option("--until"),
    run: option("--capture"),
  })
    .then(console.log)
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
module.exports = { request, collect, QUERY, API_VERSION };
