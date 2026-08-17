// ============================================================
// ROCK ON RUBY — ONE-OFF Historical Backfill
// Pulls FY24 (Aug 2023–Jul 2024) and FY25 (Aug 2024–Jul 2025) from
// Shopify Analytics and merges them into data.json's years object,
// so the cumulative LTV:CAC figure has a real 3 years of history
// (FY24+FY25+FY26 = 36 months) immediately, instead of growing into
// it organically over the next ~2 years.
//
// NOT scheduled — run once via workflow_dispatch. Never touches
// years.FY26 or years.FY27, which fetch-data.js owns exclusively;
// each historical FY is also skipped if it already exists in
// data.json, so re-running this is a safe no-op rather than a
// re-fetch (delete the year's block first if you deliberately want
// to re-pull it).
//
// Store went live on Shopify 9 May 2023 (order ROR-3063), so FY24
// (starting Aug 2023) is a genuine full year of real trading — no
// partial-history skew. Not going back further than FY24: the
// cumulative window caps at 36 months, and FY24+FY25+FY26 already
// covers exactly that, so anything earlier would just get sliced off.
//
// CAVEAT: Shopify's cost_of_goods_sold/gross_profit are NOT point-in-
// time — they apply whatever unit cost is set on a SKU TODAY back
// across all its historical orders. So FY24/FY25 margin % here means
// "that year's revenue at today's costs," not their true historical
// margin. Same limitation already applies to FY26/FY27 — this isn't
// a new inconsistency, just worth knowing it also applies here.
// ============================================================

const fs   = require('fs');
const path = require('path');

// ── CONFIG ───────────────────────────────────────────────────
const SHOPIFY_STORE     = process.env.SHOPIFY_STORE;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_SECRET    = process.env.SHOPIFY_CLIENT_SECRET;

const HISTORICAL_FYS = [
  { FY_KEY: 'FY24', FY_START: '2023-08-01', FY_END: '2024-07-31', FY_LABEL: 'Aug 2023 – Jul 2024' },
  { FY_KEY: 'FY25', FY_START: '2024-08-01', FY_END: '2025-07-31', FY_LABEL: 'Aug 2024 – Jul 2025' },
];

// ── FISCAL YEAR MONTHS (mirrors fetch-data.js's computeFiscalYear) ──
function fyMonths(fyStartDate) {
  const startYear  = Number(fyStartDate.slice(0, 4));
  const endYear    = startYear + 1;
  const monthNames = ['Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul'];
  const pad2       = n => String(n).slice(-2);
  return monthNames.map((label, i) => {
    const calYear  = i < 5 ? startYear : endYear;      // Aug–Dec = startYear, Jan–Jul = endYear
    const calMonth = ((i + 7) % 12) + 1;                // Aug(7)->8 ... Jul(6)->7 next cycle
    const pad      = n => String(n).padStart(2, '0');
    return { key: `${calYear}-${pad(calMonth)}`, label: `${label} ${pad2(calYear)}` };
  });
}

// ── GET FRESH SHOPIFY TOKEN (same as fetch-data.js) ───────────
async function getShopifyToken() {
  const resp = await fetch(
    `https://${SHOPIFY_STORE}.myshopify.com/admin/oauth/access_token`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_SECRET,
        grant_type:    'client_credentials',
      }),
    }
  );
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token request failed: ${resp.status} ${body}`);
  }
  const data = await resp.json();
  if (!data.access_token) throw new Error(`No token in response: ${JSON.stringify(data)}`);
  console.log(`  ✓ Token obtained (valid for ${Math.round(data.expires_in / 3600)}hrs)`);
  return data.access_token;
}

// ── SHOPIFYQL QUERY RUNNER (same as fetch-data.js) ────────────
async function runShopifyQL(token, shopifyql) {
  const query = `
    query ShopifyQLQuery($query: String!) {
      shopifyqlQuery(query: $query) {
        tableData { rows }
        parseErrors
      }
    }
  `;
  const resp = await fetch(
    `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2026-04/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type':           'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables: { query: shopifyql } }),
    }
  );
  const json = await resp.json();
  if (!resp.ok || json.errors) {
    throw new Error(`ShopifyQL request failed: ${JSON.stringify(json.errors || json)}`);
  }
  const result = json.data?.shopifyqlQuery;
  if (result?.parseErrors?.length) {
    throw new Error(`ShopifyQL parse errors: ${result.parseErrors.join('; ')}`);
  }
  return result?.tableData?.rows || [];
}

// ── FETCH MONTHLY SALES FOR AN ARBITRARY DATE RANGE ───────────
async function fetchMonthlySales(token, since, until) {
  const shopifyql =
    `FROM sales ` +
    `SHOW total_sales, net_sales, orders, average_order_value, returning_customers, customers, cost_of_goods_sold, gross_profit ` +
    `GROUP BY month SINCE ${since} UNTIL ${until} ORDER BY month`;

  const rows = await runShopifyQL(token, shopifyql);
  console.log(`    ✓ Monthly sales: ${rows.length} months returned`);

  const byMonth = {};
  rows.forEach(row => {
    const monthKey = (row.month || '').slice(0, 7);
    if (!monthKey) return;

    const netSales = row.net_sales != null ? Number(row.net_sales) : null;
    const cogs     = row.cost_of_goods_sold != null ? Number(row.cost_of_goods_sold) : null;
    const gp       = row.gross_profit != null ? Number(row.gross_profit) : null;
    const costedRevenue    = (cogs != null && gp != null) ? cogs + gp : null;
    const marginPctCovered = costedRevenue ? gp / costedRevenue : null;
    const costCoverage     = (netSales && costedRevenue != null) ? costedRevenue / netSales : null;
    const estGrossProfit   = (netSales != null && marginPctCovered != null) ? netSales * marginPctCovered : null;

    byMonth[monthKey] = {
      revenue:    row.total_sales    != null ? Math.round(Number(row.total_sales)           * 100) / 100 : null,
      netSales:   netSales           != null ? Math.round(netSales * 100) / 100 : null,
      orders:     row.orders         != null ? Number(row.orders)                                        : null,
      aov:        row.average_order_value != null ? Math.round(Number(row.average_order_value) * 100) / 100 : null,
      returning:  row.returning_customers != null ? Number(row.returning_customers)                       : null,
      customers:  row.customers      != null ? Number(row.customers)                                     : null,
      costOfGoodsSold:    cogs   != null ? Math.round(cogs * 100) / 100 : null,
      grossProfit:        gp     != null ? Math.round(gp * 100) / 100 : null,
      marginPctCovered:   marginPctCovered != null ? Math.round(marginPctCovered * 1000) / 1000 : null,
      costCoverage:        costCoverage    != null ? Math.round(costCoverage * 1000) / 1000 : null,
      estGrossProfit:       estGrossProfit  != null ? Math.round(estGrossProfit * 100) / 100 : null,
    };
  });
  return byMonth;
}

// ── FETCH MONTHLY SESSIONS FOR AN ARBITRARY DATE RANGE ────────
async function fetchMonthlySessions(token, since, until) {
  const shopifyql =
    `FROM sessions ` +
    `SHOW sessions, conversion_rate, sessions_that_completed_checkout ` +
    `GROUP BY month SINCE ${since} UNTIL ${until} ORDER BY month`;

  const rows = await runShopifyQL(token, shopifyql);
  console.log(`    ✓ Monthly sessions: ${rows.length} months returned`);

  const byMonth = {};
  rows.forEach(row => {
    const monthKey = (row.month || '').slice(0, 7);
    if (!monthKey) return;
    const sessions          = Number(row.sessions || 0);
    const convertedSessions = Number(row.sessions_that_completed_checkout || 0);
    byMonth[monthKey] = {
      sessions,
      convertedSessions,
      conversionRate:        sessions ? convertedSessions / sessions : null,
      shopifyConversionRate: row.conversion_rate != null ? Number(row.conversion_rate) : null,
    };
  });
  return byMonth;
}

// ── FETCH TOP PRODUCTS FOR AN ARBITRARY DATE RANGE ─────────────
// Non-blocking — this isn't used by LTV:CAC at all, just fills out the
// year's block for consistency with FY26/FY27. Falls back to an empty
// list if it fails; never aborts the backfill over this.
async function fetchTopProducts(token, since, until) {
  const shopifyql =
    `FROM sales ` +
    `SHOW total_sales, orders, product_title ` +
    `GROUP BY product_title ` +
    `SINCE ${since} UNTIL ${until} ` +
    `ORDER BY total_sales DESC ` +
    `LIMIT 10`;
  try {
    const rows = await runShopifyQL(token, shopifyql);
    console.log(`    ✓ Top products: ${rows.length} rows returned`);
    return rows
      .filter(r => r.product_title)
      .map(r => ({
        name:    r.product_title,
        revenue: r.total_sales != null ? Math.round(Number(r.total_sales) * 100) / 100 : 0,
        orders:  r.orders      != null ? Number(r.orders)                             : 0,
      }));
  } catch (e) {
    console.warn(`    ⚠ Top products fetch failed, leaving empty: ${e.message}`);
    return [];
  }
}

// ── BUILD ONE HISTORICAL FY BLOCK ───────────────────────────────
async function buildFYBlock(token, fy) {
  console.log(`\n→ Fetching ${fy.FY_KEY} (${fy.FY_LABEL})...`);

  const [monthlySales, monthlySessions, topProducts] = await Promise.all([
    fetchMonthlySales(token, fy.FY_START, fy.FY_END),
    fetchMonthlySessions(token, fy.FY_START, fy.FY_END),
    fetchTopProducts(token, fy.FY_START, fy.FY_END),
  ]);

  // Every month in a fully-past FY is real, finished data — no
  // future/mtd concept applies the way it does for the current year.
  const monthly = fyMonths(fy.FY_START).map(({ key, label }) => {
    const sales    = monthlySales[key]    || {};
    const sessions = monthlySessions[key] || {};
    return {
      key,
      label,
      revenue:               sales.revenue    ?? null,
      netSales:              sales.netSales   ?? null,
      orders:                sales.orders     ?? null,
      aov:                   sales.aov        ?? null,
      customers:             sales.customers  ?? null,
      returning:             sales.returning  ?? null,
      sessions:              sessions.sessions ?? null,
      complete:              true,
      mtd:                   false,
      future:                false,
      convertedSessions:     sessions.convertedSessions    ?? null,
      conversionRate:        sessions.conversionRate       ?? null,
      shopifyConversionRate: sessions.shopifyConversionRate ?? null,
      costOfGoodsSold:       sales.costOfGoodsSold  ?? null,
      grossProfit:           sales.grossProfit      ?? null,
      marginPctCovered:      sales.marginPctCovered ?? null,
      costCoverage:          sales.costCoverage     ?? null,
      estGrossProfit:        sales.estGrossProfit   ?? null,
    };
  });

  const ytdRevenue    = monthly.reduce((s, m) => s + (m.revenue    || 0), 0);
  const ytdNetSales   = monthly.reduce((s, m) => s + (m.netSales   || 0), 0);
  const ytdOrders     = monthly.reduce((s, m) => s + (m.orders     || 0), 0);
  const ytdReturning  = monthly.reduce((s, m) => s + (m.returning  || 0), 0);
  const ytdCustomers  = monthly.reduce((s, m) => s + (m.customers  || 0), 0);
  const ytdSessions   = monthly.some(m => m.sessions) ? monthly.reduce((s, m) => s + (m.sessions || 0), 0) : null;
  const ytdConverted  = monthly.some(m => m.convertedSessions) ? monthly.reduce((s, m) => s + (m.convertedSessions || 0), 0) : null;

  const ytdCogs          = monthly.reduce((s, m) => s + (m.costOfGoodsSold || 0), 0);
  const ytdGrossProfit   = monthly.reduce((s, m) => s + (m.grossProfit || 0), 0);
  const ytdCostedRevenue = ytdCogs + ytdGrossProfit;
  const ytdMarginPct     = ytdCostedRevenue ? Math.round((ytdGrossProfit / ytdCostedRevenue) * 1000) / 1000 : null;
  const ytdCostCoverage  = ytdNetSales ? Math.round((ytdCostedRevenue / ytdNetSales) * 1000) / 1000 : null;
  const ytdEstGrossProfit = (ytdMarginPct != null) ? Math.round(ytdNetSales * ytdMarginPct * 100) / 100 : null;

  const ytdAovNumerator = monthly.reduce((s, m) => s + ((m.aov || 0) * (m.orders || 0)), 0);
  const avgAOV           = ytdOrders ? Math.round((ytdAovNumerator / ytdOrders) * 100) / 100 : 0;

  const summary = {
    ytdRevenue:        Math.round(ytdRevenue  * 100) / 100,
    ytdNetSales:       Math.round(ytdNetSales * 100) / 100,
    ytdOrders,
    ytdSessions,
    ytdConvertedSessions: ytdConverted,
    avgConversionRate: ytdSessions && ytdConverted != null
      ? Math.round((ytdConverted / ytdSessions) * 10000) / 10000 : null,
    avgAOV,
    avgRepeatRate:     ytdCustomers ? Math.round((ytdReturning / ytdCustomers) * 1000) / 1000 : 0,
    ytdReturning,
    ytdCustomers,
    ytdCostOfGoodsSold: Math.round(ytdCogs * 100) / 100,
    ytdGrossProfit:     Math.round(ytdGrossProfit * 100) / 100,
    ytdMarginPct,
    ytdCostCoverage,
    ytdEstGrossProfit,
  };

  console.log(`  ✓ ${fy.FY_KEY}: £${summary.ytdRevenue.toLocaleString('en-GB')} revenue, ${summary.ytdOrders} orders, ${summary.ytdCustomers} customers`);

  return { fyLabel: fy.FY_LABEL, monthly, topProducts, summary };
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('=== ROR Dashboard — Historical Backfill (FY24 + FY25) ===');

  const dataPath = path.join(__dirname, '..', 'data.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  console.log('\n→ Authenticating with Shopify...');
  const token = await getShopifyToken();

  const newYears = {};
  for (const fy of HISTORICAL_FYS) {
    if (raw.years[fy.FY_KEY]) {
      console.log(`\n– ${fy.FY_KEY} already exists in data.json — skipping. Delete that block first if you want to re-pull it.`);
      continue;
    }
    newYears[fy.FY_KEY] = await buildFYBlock(token, fy);
  }

  if (!Object.keys(newYears).length) {
    console.log('\n✓ Nothing to do — FY24 and FY25 are both already present.');
    return;
  }

  // SAFETY: spread raw.years first so FY26/FY27 (and anything else
  // already there) are carried over byte-for-byte — this script only
  // ever adds the historical years it just fetched.
  const output = {
    ...raw,
    years: {
      ...raw.years,
      ...newYears,
    },
  };

  fs.writeFileSync(dataPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ data.json updated with ${Object.keys(newYears).join(', ')}`);
}

main().catch(e => { console.error('\n✗ Fatal error:', e); process.exit(1); });
