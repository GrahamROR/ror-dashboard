// ============================================================
// ROCK ON RUBY — Dashboard Data Fetcher v5
// Pure ShopifyQL approach — every run pulls fresh data
// directly from Shopify Analytics. No compounding, no drift.
// data.json is overwritten with clean Shopify numbers daily.
// ============================================================

const fs   = require('fs');
const path = require('path');

// ── CONFIG ───────────────────────────────────────────────────
const SHOPIFY_STORE     = process.env.SHOPIFY_STORE;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_SECRET    = process.env.SHOPIFY_CLIENT_SECRET;

// FY26: Aug 2025 – Jul 2026
const FY_START   = '2025-08-01';
const FY_END     = '2026-07-31';
const FY_KEY     = 'FY26';
const FY_LABEL   = 'Aug 2025 – Jul 2026';

// All 12 months of FY26 in order
const FY_MONTHS = [
  { key: '2025-08', label: 'Aug 25' },
  { key: '2025-09', label: 'Sep 25' },
  { key: '2025-10', label: 'Oct 25' },
  { key: '2025-11', label: 'Nov 25' },
  { key: '2025-12', label: 'Dec 25' },
  { key: '2026-01', label: 'Jan 26' },
  { key: '2026-02', label: 'Feb 26' },
  { key: '2026-03', label: 'Mar 26' },
  { key: '2026-04', label: 'Apr 26' },
  { key: '2026-05', label: 'May 26' },
  { key: '2026-06', label: 'Jun 26' },
  { key: '2026-07', label: 'Jul 26' },
];

// ── DATE HELPERS ─────────────────────────────────────────────
function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getCurrentMonthKey() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

// ── GET FRESH SHOPIFY TOKEN ───────────────────────────────────
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

// ── SHOPIFYQL QUERY RUNNER ────────────────────────────────────
async function runShopifyQL(token, shopifyql) {
  const query = `
    query ShopifyQLQuery($query: String!) {
      shopifyqlQuery(query: $query) {
        tableData {
          rows
        }
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

// ── FETCH FY SALES BY MONTH ───────────────────────────────────
// Returns total_sales, orders, aov, returning_customers, customers
// grouped by month — exactly matching Shopify's own dashboard.
async function fetchMonthlySales(token) {
  const shopifyql =
    `FROM sales ` +
    `SHOW total_sales, orders, average_order_value, returning_customers, customers ` +
    `GROUP BY month SINCE ${FY_START} UNTIL ${FY_END} ORDER BY month`;

  const rows = await runShopifyQL(token, shopifyql);
  console.log(`  ✓ Monthly sales: ${rows.length} months returned`);

  const byMonth = {};
  rows.forEach(row => {
    const monthKey = (row.month || '').slice(0, 7);
    if (!monthKey) return;
    byMonth[monthKey] = {
      revenue:    row.total_sales    != null ? Math.round(Number(row.total_sales)           * 100) / 100 : null,
      orders:     row.orders         != null ? Number(row.orders)                                        : null,
      aov:        row.average_order_value != null ? Math.round(Number(row.average_order_value) * 100) / 100 : null,
      returning:  row.returning_customers != null ? Number(row.returning_customers)                       : null,
      customers:  row.customers      != null ? Number(row.customers)                                     : null,
    };
  });

  return byMonth;
}

// ── FETCH FY SESSIONS BY MONTH ────────────────────────────────
// Sessions come from a separate Shopify Analytics table.
async function fetchMonthlySessions(token) {
  const shopifyql =
    `FROM sessions ` +
    `SHOW sessions, conversion_rate, sessions_that_completed_checkout ` +
    `GROUP BY month SINCE ${FY_START} UNTIL ${FY_END} ORDER BY month`;

  const rows = await runShopifyQL(token, shopifyql);
  console.log(`  ✓ Monthly sessions: ${rows.length} months returned`);

  const byMonth = {};
  rows.forEach(row => {
    const monthKey = (row.month || '').slice(0, 7);
    if (!monthKey) return;
    const sessions           = Number(row.sessions || 0);
    const convertedSessions  = Number(row.sessions_that_completed_checkout || 0);
    byMonth[monthKey] = {
      sessions,
      convertedSessions,
      conversionRate:        sessions ? convertedSessions / sessions : null,
      shopifyConversionRate: row.conversion_rate != null ? Number(row.conversion_rate) : null,
    };
  });

  return byMonth;
}

// ── FETCH YESTERDAY ───────────────────────────────────────────
async function fetchYesterdaySales(token, dateStr) {
  const salesQL =
    `FROM sales ` +
    `SHOW total_sales, orders, average_order_value, returning_customers, customers ` +
    `SINCE ${dateStr} UNTIL ${dateStr}`;

  const sessionsQL =
    `FROM sessions ` +
    `SHOW sessions, conversion_rate, sessions_that_completed_checkout ` +
    `SINCE ${dateStr} UNTIL ${dateStr}`;

  const [salesRows, sessionsRows] = await Promise.all([
    runShopifyQL(token, salesQL),
    runShopifyQL(token, sessionsQL),
  ]);

  const s = salesRows[0]    || {};
  const a = sessionsRows[0] || {};

  const revenue   = s.total_sales            != null ? Math.round(Number(s.total_sales)           * 100) / 100 : 0;
  const orders    = s.orders                 != null ? Number(s.orders)                                        : 0;
  const aov       = s.average_order_value    != null ? Math.round(Number(s.average_order_value)    * 100) / 100 : null;
  const returning = s.returning_customers    != null ? Number(s.returning_customers)                           : 0;
  const customers = s.customers              != null ? Number(s.customers)                                     : 0;
  const sessions  = Number(a.sessions || 0);
  const converted = Number(a.sessions_that_completed_checkout || 0);

  console.log(`  ✓ Yesterday: £${revenue} | ${orders} orders | ${sessions} sessions | ${returning}/${customers} returning`);

  return {
    date:                 dateStr,
    monthKey:             dateStr.slice(0, 7),
    revenue,
    orders,
    customers,
    returning,
    repeatRate:           customers ? Math.round((returning / customers) * 1000) / 1000 : 0,
    aov,
    sessions,
    convertedSessions:    converted,
    conversionRate:       sessions ? converted / sessions : null,
    shopifyConversionRate: a.conversion_rate != null ? Number(a.conversion_rate) : null,
    margin:               null,
    profit:               null,
    marginSource:         'pending_sku_cost_data',
    profitSource:         'pending_sku_cost_data',
    revenueSource:        'Shopify Analytics total_sales',
    analyticsSource:      'Shopify Analytics sessions report',
  };
}

// ── FETCH TOP PRODUCTS ────────────────────────────────────────
// Preserves existing topProducts from data.json — these are
// manually seeded and don't need daily updates.
function preserveTopProducts(existing) {
  return existing?.topProducts || [];
}

// ── LOAD EXISTING DATA ────────────────────────────────────────
function loadExistingData() {
  const dataPath = path.join(__dirname, '..', 'data.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error('data.json not found. Upload the seed file first.');
  }
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  const dateStr       = getYesterday();
  const thisMonthKey  = getCurrentMonthKey();

  console.log('=== ROR Dashboard — Clean Pull v5 ===');
  console.log(`Date: ${dateStr} | Current month: ${thisMonthKey}`);
  console.log('Strategy: full ShopifyQL overwrite — no compounding\n');

  // Load existing data (to preserve topProducts and FY config)
  console.log('→ Loading existing data.json...');
  const existing = loadExistingData();

  // Auth
  console.log('\n→ Authenticating with Shopify...');
  const token = await getShopifyToken();

  // Fetch everything in parallel
  console.log('\n→ Fetching all data from Shopify Analytics...');
  const [monthlySales, monthlySessions, yesterday] = await Promise.all([
    fetchMonthlySales(token),
    fetchMonthlySessions(token),
    fetchYesterdaySales(token, dateStr),
  ]);

  // Build the monthly array — all 12 FY months
  const now            = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const todayDay       = String(now.getDate()).padStart(2, '0');

  const monthly = FY_MONTHS.map(({ key, label }) => {
    const isFuture   = key > thisMonthKey;
    const isMTD      = key === thisMonthKey;
    const isComplete = key < thisMonthKey;

    if (isFuture) {
      return { key, label, revenue: null, orders: null, customers: null, returning: null, sessions: null, complete: false, mtd: false, future: true };
    }

    const sales    = monthlySales[key]    || {};
    const sessions = monthlySessions[key] || {};

    return {
      key,
      label,
      revenue:              sales.revenue    ?? null,
      orders:               sales.orders     ?? null,
      aov:                  sales.aov        ?? null,
      customers:            sales.customers  ?? null,
      returning:            sales.returning  ?? null,
      sessions:             sessions.sessions ?? null,
      complete:             isComplete,
      mtd:                  isMTD,
      future:               false,
      convertedSessions:    sessions.convertedSessions    ?? null,
      conversionRate:       sessions.conversionRate       ?? null,
      shopifyConversionRate: sessions.shopifyConversionRate ?? null,
    };
  });

  // Build summary from active months
  const active           = monthly.filter(m => !m.future);
  const ytdRevenue       = active.reduce((s, m) => s + (m.revenue   || 0), 0);
  const ytdOrders        = active.reduce((s, m) => s + (m.orders    || 0), 0);
  const ytdReturning     = active.reduce((s, m) => s + (m.returning || 0), 0);
  const ytdCustomers     = active.reduce((s, m) => s + (m.customers || 0), 0);
  const ytdSessions      = active.some(m => m.sessions)
    ? active.reduce((s, m) => s + (m.sessions || 0), 0) : null;
  const ytdConverted     = active.some(m => m.convertedSessions)
    ? active.reduce((s, m) => s + (m.convertedSessions || 0), 0) : null;

  // Weighted average of Shopify's actual average_order_value per month
  // (gross_sales net of discounts / orders) — NOT total_sales/orders which inflates AOV with shipping & taxes
  const ytdAovNumerator  = active.reduce((s, m) => s + ((m.aov || 0) * (m.orders || 0)), 0);
  const avgAOV           = ytdOrders ? Math.round((ytdAovNumerator / ytdOrders) * 100) / 100 : 0;

  const summary = {
    ytdRevenue:        Math.round(ytdRevenue   * 100) / 100,
    ytdOrders,
    ytdSessions,
    ytdConvertedSessions: ytdConverted,
    avgConversionRate: ytdSessions && ytdConverted != null
      ? Math.round((ytdConverted / ytdSessions) * 10000) / 10000 : null,
    avgAOV:            avgAOV,
    avgRepeatRate:     ytdCustomers ? Math.round((ytdReturning / ytdCustomers) * 1000) / 1000 : 0,
    ytdReturning,
    ytdCustomers,
  };

  // Assemble final data.json
  const output = {
    updated:  new Date().toISOString(),
    fy:       FY_KEY,
    fyLabel:  FY_LABEL,
    monthly,
    topProducts: preserveTopProducts(existing),
    summary,
    yesterday,
  };

  // Write
  const outPath = path.join(__dirname, '..', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log('\n✓ data.json written — clean pull complete');
  console.log(`  YTD Revenue: £${summary.ytdRevenue.toLocaleString('en-GB')}`);
  console.log(`  YTD Orders:  ${summary.ytdOrders.toLocaleString('en-GB')}`);
  console.log(`  Avg AOV:     £${summary.avgAOV}`);
  console.log(`  Repeat rate: ${(summary.avgRepeatRate * 100).toFixed(1)}%`);
  console.log(`  Yesterday:   £${yesterday.revenue} | ${yesterday.orders} orders`);
}

main().catch(e => { console.error('\n✗ Fatal error:', e); process.exit(1); });
