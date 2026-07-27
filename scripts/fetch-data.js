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

// ── FISCAL YEAR (auto-computed — no more annual hand-editing) ──
// ROR's fiscal year runs Aug → Jul. Given today's date, work out which
// FY we're currently in, so this script never needs manual updating
// at year-end. FY_KEY/START/END/MONTHS below are for THIS RUN ONLY —
// they describe the "current" year being refreshed. Past years are
// untouched (see writeYearBlock / main()).
function computeFiscalYear(now) {
  const month     = now.getMonth(); // 0 = Jan … 7 = Aug
  const startYear = month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const endYear   = startYear + 1;
  const pad2      = n => String(n).slice(-2);
  const monthNames = ['Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul'];

  const months = monthNames.map((label, i) => {
    const calYear  = i < 5 ? startYear : endYear;      // Aug–Dec = startYear, Jan–Jul = endYear
    const calMonth = ((i + 7) % 12) + 1;                // Aug(7)->8 ... Jul(6)->7 next cycle
    const pad      = n => String(n).padStart(2, '0');
    return { key: `${calYear}-${pad(calMonth)}`, label: `${label} ${pad2(calYear)}` };
  });

  return {
    FY_KEY:   `FY${pad2(endYear)}`,
    FY_START: `${startYear}-08-01`,
    FY_END:   `${endYear}-07-31`,
    FY_LABEL: `Aug ${startYear} – Jul ${endYear}`,
    FY_MONTHS: months,
  };
}

const { FY_KEY, FY_START, FY_END, FY_LABEL, FY_MONTHS } = computeFiscalYear(new Date());

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
// Returns total_sales, orders, aov, returning_customers, customers,
// cost_of_goods_sold, gross_profit — grouped by month.
// NOTE on cost_of_goods_sold/gross_profit: Shopify only computes these
// for line items where a variant has inventoryItem.unitCost set. Until
// every SKU has a cost, these two figures cover a PARTIAL slice of
// net_sales, not all of it. We derive marginPctCovered from the ratio
// between them (a real, unbiased margin %) and separately track what
// % of net_sales that slice represents (costCoverage), then extrapolate
// an estimated total gross profit by applying marginPctCovered to the
// full net_sales figure. This is an estimate, not an audited number,
// and gets more accurate as more SKUs get costed.
async function fetchMonthlySales(token) {
  const shopifyql =
    `FROM sales ` +
    `SHOW total_sales, net_sales, orders, average_order_value, returning_customers, customers, cost_of_goods_sold, gross_profit ` +
    `GROUP BY month SINCE ${FY_START} UNTIL ${FY_END} ORDER BY month`;

  const rows = await runShopifyQL(token, shopifyql);
  console.log(`  ✓ Monthly sales: ${rows.length} months returned`);

  const byMonth = {};
  rows.forEach(row => {
    const monthKey = (row.month || '').slice(0, 7);
    if (!monthKey) return;

    const netSales = row.net_sales != null ? Number(row.net_sales) : null;
    const cogs     = row.cost_of_goods_sold != null ? Number(row.cost_of_goods_sold) : null;
    const gp       = row.gross_profit != null ? Number(row.gross_profit) : null;
    const costedRevenue   = (cogs != null && gp != null) ? cogs + gp : null;
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

// ── LOAD EXISTING DATA (multi-year aware) ───────────────────────
// data.json shape: { updated, currentFY, yesterday, years: { FYxx: {...} } }
// If the file is still in the old single-year flat shape (fy/fyLabel/
// monthly/topProducts/summary at the top level), migrate it into
// years[oldFyKey] once, non-destructively.
function loadExistingData() {
  const dataPath = path.join(__dirname, '..', 'data.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error('data.json not found. Upload the seed file first.');
  }
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  if (raw.years) return raw; // already multi-year shape

  console.log('  ↻ Migrating data.json from single-year to multi-year shape...');
  const oldFyKey = raw.fy || FY_KEY;
  return {
    updated:   raw.updated || null,
    currentFY: oldFyKey,
    yesterday: raw.yesterday || null,
    years: {
      [oldFyKey]: {
        fyLabel:     raw.fyLabel || FY_LABEL,
        monthly:     raw.monthly || [],
        topProducts: raw.topProducts || [],
        summary:     raw.summary || {},
      },
    },
  };
}

// Preserves existing topProducts for the CURRENT year's block only —
// these are manually seeded and don't need daily updates.
function preserveTopProducts(existing) {
  return existing?.years?.[FY_KEY]?.topProducts || [];
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
      netSales:             sales.netSales   ?? null,
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
      costOfGoodsSold:      sales.costOfGoodsSold  ?? null,
      grossProfit:          sales.grossProfit      ?? null,
      marginPctCovered:     sales.marginPctCovered ?? null,
      costCoverage:         sales.costCoverage     ?? null,
      estGrossProfit:       sales.estGrossProfit   ?? null,
    };
  });

  // Build summary from active months
  const active           = monthly.filter(m => !m.future);
  const ytdRevenue       = active.reduce((s, m) => s + (m.revenue   || 0), 0);
  const ytdNetSales      = active.reduce((s, m) => s + (m.netSales  || 0), 0);
  const ytdOrders        = active.reduce((s, m) => s + (m.orders    || 0), 0);
  const ytdReturning     = active.reduce((s, m) => s + (m.returning || 0), 0);
  const ytdCustomers     = active.reduce((s, m) => s + (m.customers || 0), 0);
  const ytdSessions      = active.some(m => m.sessions)
    ? active.reduce((s, m) => s + (m.sessions || 0), 0) : null;
  const ytdConverted     = active.some(m => m.convertedSessions)
    ? active.reduce((s, m) => s + (m.convertedSessions || 0), 0) : null;

  // YTD margin — sum the raw costed-revenue slices across months first,
  // THEN take the ratio. (Averaging monthly % would weight a low-volume
  // month equally to a high-volume one — summing £ first is correct.)
  const ytdCogs          = active.reduce((s, m) => s + (m.costOfGoodsSold || 0), 0);
  const ytdGrossProfit   = active.reduce((s, m) => s + (m.grossProfit || 0), 0);
  const ytdCostedRevenue = ytdCogs + ytdGrossProfit;
  const ytdMarginPct     = ytdCostedRevenue ? Math.round((ytdGrossProfit / ytdCostedRevenue) * 1000) / 1000 : null;
  const ytdCostCoverage  = ytdNetSales ? Math.round((ytdCostedRevenue / ytdNetSales) * 1000) / 1000 : null;
  const ytdEstGrossProfit = (ytdMarginPct != null) ? Math.round(ytdNetSales * ytdMarginPct * 100) / 100 : null;

  // Weighted average of Shopify's actual average_order_value per month
  // (gross_sales net of discounts / orders) — NOT total_sales/orders which inflates AOV with shipping & taxes
  const ytdAovNumerator  = active.reduce((s, m) => s + ((m.aov || 0) * (m.orders || 0)), 0);
  const avgAOV           = ytdOrders ? Math.round((ytdAovNumerator / ytdOrders) * 100) / 100 : 0;

  const summary = {
    ytdRevenue:        Math.round(ytdRevenue   * 100) / 100,
    ytdNetSales:       Math.round(ytdNetSales  * 100) / 100,
    ytdOrders,
    ytdSessions,
    ytdConvertedSessions: ytdConverted,
    avgConversionRate: ytdSessions && ytdConverted != null
      ? Math.round((ytdConverted / ytdSessions) * 10000) / 10000 : null,
    avgAOV:            avgAOV,
    avgRepeatRate:     ytdCustomers ? Math.round((ytdReturning / ytdCustomers) * 1000) / 1000 : 0,
    ytdReturning,
    ytdCustomers,
    ytdCostOfGoodsSold: Math.round(ytdCogs * 100) / 100,
    ytdGrossProfit:     Math.round(ytdGrossProfit * 100) / 100,
    ytdMarginPct,
    ytdCostCoverage,
    ytdEstGrossProfit,
  };

  // Assemble final data.json — SAFETY: spread `existing.years` first so
  // every OTHER fiscal year's block is carried over byte-for-byte. We
  // only ever overwrite years[FY_KEY]. A past year, once closed, is never
  // touched by this script again — no risk of a bad run corrupting history.
  const output = {
    updated:   new Date().toISOString(),
    currentFY: FY_KEY,
    yesterday,
    years: {
      ...(existing.years || {}),
      [FY_KEY]: {
        fyLabel:     FY_LABEL,
        monthly,
        topProducts: preserveTopProducts(existing),
        summary,
      },
    },
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
