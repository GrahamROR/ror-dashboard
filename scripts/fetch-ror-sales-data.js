// Export a privacy-safe commercial aggregate from production D1 for Dashboard 2.
// Deliberately excludes customer data, order identifiers, SKUs, mapping fields,
// supplier purchases and all inventory data.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DAILY_SQL = `
SELECT
  substr(placed_at, 1, 10) AS date,
  source AS channel,
  ROUND(SUM(gross_revenue), 2) AS revenue,
  COUNT(DISTINCT external_order_id) AS orders,
  SUM(quantity) AS units
FROM sales_history_items
WHERE source IN ('shopify', 'etsy', 'noths')
GROUP BY substr(placed_at, 1, 10), source
ORDER BY date, channel`;

const META_SQL = `
SELECT
  substr(MIN(placed_at), 1, 10) AS earliest,
  substr(MAX(placed_at), 1, 10) AS latest,
  COUNT(*) AS row_count,
  SUM(quantity) AS unit_count
FROM sales_history_items
WHERE source IN ('shopify', 'etsy', 'noths')`;

function unwrap(payload) {
  if (Array.isArray(payload)) return payload[0].results || [];
  const result = payload.result;
  if (Array.isArray(result)) return (result[0] && result[0].results) || [];
  return (result && result.results) || [];
}

async function queryApi(sql) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const database = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !database || !token) throw new Error('CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_API_TOKEN are required.');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(`D1 query failed (${response.status}): ${JSON.stringify(payload.errors || payload)}`);
  return unwrap(payload);
}

function queryWrangler(bin, sql) {
  const run = spawnSync(bin, ['d1', 'execute', 'stockhub', '--remote', '--json', '--command', sql], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr || `Wrangler exited ${run.status}`);
  return unwrap(JSON.parse(run.stdout));
}

async function main() {
  const binArg = process.argv.indexOf('--wrangler-bin');
  const wranglerBin = binArg >= 0 ? process.argv[binArg + 1] : null;
  const query = wranglerBin ? (sql) => queryWrangler(wranglerBin, sql) : queryApi;
  const [daily, metaRows] = await Promise.all([query(DAILY_SQL), query(META_SQL)]);
  const meta = metaRows[0];
  if (!meta || !meta.earliest || !meta.latest || !daily.length) throw new Error('Production sales query returned no data.');

  const records = daily.map((r) => ({
    date: r.date,
    channel: r.channel,
    revenue: Number(r.revenue),
    orders: Number(r.orders),
    units: Number(r.units),
    currency: 'GBP',
    source: 'sales_history_items',
    completeness: r.date === meta.latest ? 'partial' : 'complete',
  }));
  const channels = [...new Set(records.map((r) => r.channel))].sort();
  const output = {
    meta: {
      source_table: 'sales_history_items',
      grain: 'daily-channel',
      revenue_field: 'gross_revenue',
      earliest: meta.earliest,
      latest: meta.latest,
      row_count: Number(meta.row_count),
      unit_count: Number(meta.unit_count),
      channels,
      includes_unmapped: true,
      generated_at: new Date().toISOString(),
    },
    records,
  };
  const outPath = path.join(__dirname, '..', 'dashboard2', 'sales-data.json');
  fs.writeFileSync(outPath, JSON.stringify(output) + '\n');
  console.log(`Wrote ${records.length} daily channel records (${meta.earliest} to ${meta.latest}) to ${outPath}`);
}

main().catch((error) => { console.error(error.message || error); process.exit(1); });
