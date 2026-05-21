// ============================================================
// ROCK ON RUBY — Dashboard Data Fetcher
// Runs daily via GitHub Actions
// Calls Shopify Orders API + GA4 Data API
// Writes data.json to repo root (served by GitHub Pages)
// ============================================================

const fs      = require('fs');
const path    = require('path');
const { google } = require('googleapis');

// ── CONFIG (from GitHub secrets) ─────────────────────────────
const SHOPIFY_STORE   = process.env.SHOPIFY_STORE;    // e.g. rockonruby
const SHOPIFY_TOKEN   = process.env.SHOPIFY_TOKEN;    // shpat_xxx
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID;  // 9-digit number
const GA4_CREDENTIALS = process.env.GA4_CREDENTIALS   // full service account JSON string
  ? JSON.parse(process.env.GA4_CREDENTIALS)
  : null;

// ── FINANCIAL YEAR ────────────────────────────────────────────
// FY26 = Aug 2025 → Jul 2026
const FY_START = '2025-08-01T00:00:00+00:00';
const FY_END   = '2026-07-31T23:59:59+00:00';
const TODAY    = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
const THIS_MONTH = TODAY.slice(0, 7);                     // YYYY-MM

const FY_MONTHS = [
  { key:'2025-08', label:'Aug 25', end:'2025-08-31', days:31 },
  { key:'2025-09', label:'Sep 25', end:'2025-09-30', days:30 },
  { key:'2025-10', label:'Oct 25', end:'2025-10-31', days:31 },
  { key:'2025-11', label:'Nov 25', end:'2025-11-30', days:30 },
  { key:'2025-12', label:'Dec 25', end:'2025-12-31', days:31 },
  { key:'2026-01', label:'Jan 26', end:'2026-01-31', days:31 },
  { key:'2026-02', label:'Feb 26', end:'2026-02-28', days:28 },
  { key:'2026-03', label:'Mar 26', end:'2026-03-31', days:31 },
  { key:'2026-04', label:'Apr 26', end:'2026-04-30', days:30 },
  { key:'2026-05', label:'May 26', end:'2026-05-31', days:31 },
  { key:'2026-06', label:'Jun 26', end:'2026-06-30', days:30 },
  { key:'2026-07', label:'Jul 26', end:'2026-07-31', days:31 },
];

// ── SHOPIFY ───────────────────────────────────────────────────
async function fetchAllOrders() {
  const base    = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01`;
  const headers = { 'X-Shopify-Access-Token': SHOPIFY_TOKEN };

  let allOrders = [];
  let url = `${base}/orders.json?status=any&financial_status=paid` +
            `&created_at_min=${FY_START}&created_at_max=${FY_END}` +
            `&limit=250&fields=created_at,current_total_price,customer,line_items`;

  while (url) {
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Shopify API ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    allOrders = allOrders.concat(data.orders || []);
    console.log(`  Fetched ${allOrders.length} orders so far...`);

    // Pagination via Link header
    const link = resp.headers.get('Link') || '';
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
    if (url) await sleep(300); // respect rate limits
  }

  return allOrders;
}

function aggregateOrders(orders) {
  // Initialise monthly buckets
  const buckets = {};
  FY_MONTHS.forEach(m => {
    buckets[m.key] = {
      revenue:     0,
      orders:      0,
      customerIds: new Set(),
      returning:   0,
    };
  });

  // Product aggregation
  const products = {};

  orders.forEach(order => {
    const monthKey = order.created_at.slice(0, 7); // YYYY-MM
    if (!buckets[monthKey]) return;

    const bucket = buckets[monthKey];
    bucket.revenue  += parseFloat(order.current_total_price || 0);
    bucket.orders   += 1;

    if (order.customer?.id) {
      bucket.customerIds.add(String(order.customer.id));
      if ((order.customer.orders_count || 0) > 1) bucket.returning += 1;
    }

    // Product line items
    (order.line_items || []).forEach(item => {
      const name = item.title || 'Unknown';
      if (!products[name]) products[name] = { revenue: 0, orders: 0 };
      products[name].revenue += parseFloat(item.price || 0) * (item.quantity || 1);
      products[name].orders  += 1;
    });
  });

  return { buckets, products };
}

// ── GA4 ───────────────────────────────────────────────────────
async function fetchGA4Sessions() {
  if (!GA4_CREDENTIALS || !GA4_PROPERTY_ID) {
    console.warn('  GA4 credentials not set — sessions will be null');
    return {};
  }

  const auth = new google.auth.GoogleAuth({
    credentials: GA4_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

  const sessions = {};

  for (const m of FY_MONTHS) {
    // Skip future months
    if (m.key > THIS_MONTH) { sessions[m.key] = null; continue; }

    // Current month: use today as end date
    const endDate = m.key === THIS_MONTH ? TODAY : m.end;
    const startDate = m.key + '-01';

    try {
      const res = await analyticsData.properties.runReport({
        property: `properties/${GA4_PROPERTY_ID}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          metrics:    [{ name: 'sessions' }],
        },
      });
      sessions[m.key] = parseInt(
        res.data?.rows?.[0]?.metricValues?.[0]?.value || '0', 10
      );
      console.log(`  GA4 ${m.label}: ${sessions[m.key]} sessions`);
    } catch (e) {
      console.error(`  GA4 error for ${m.label}:`, e.message);
      sessions[m.key] = null;
    }

    await sleep(200);
  }

  return sessions;
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('=== ROR Dashboard Data Fetch ===');
  console.log(`Date: ${TODAY}`);

  // Shopify
  console.log('\n→ Fetching Shopify orders for FY26...');
  const orders = await fetchAllOrders();
  console.log(`  Total: ${orders.length} orders`);
  const { buckets, products } = aggregateOrders(orders);

  // GA4
  console.log('\n→ Fetching GA4 sessions...');
  const sessionsByMonth = await fetchGA4Sessions();

  // Build monthly array
  const monthly = FY_MONTHS.map(m => {
    const b         = buckets[m.key];
    const isPast    = m.key < THIS_MONTH;
    const isCurrent = m.key === THIS_MONTH;
    const isFuture  = m.key > THIS_MONTH;

    return {
      key:       m.key,
      label:     m.label,
      revenue:   isFuture ? null : Math.round(b.revenue * 100) / 100,
      orders:    isFuture ? null : b.orders,
      customers: isFuture ? null : b.customerIds.size,
      returning: isFuture ? null : b.returning,
      sessions:  sessionsByMonth[m.key] ?? null,
      complete:  isPast,
      mtd:       isCurrent,
      future:    isFuture,
    };
  });

  // Top 10 products
  const topProducts = Object.entries(products)
    .map(([name, d]) => ({
      name,
      revenue: Math.round(d.revenue * 100) / 100,
      orders:  d.orders,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // YTD summary (complete months + current MTD)
  const activeMonths  = monthly.filter(m => !m.future);
  const ytdRevenue    = activeMonths.reduce((s, m) => s + (m.revenue  || 0), 0);
  const ytdOrders     = activeMonths.reduce((s, m) => s + (m.orders   || 0), 0);
  const ytdReturning  = activeMonths.reduce((s, m) => s + (m.returning|| 0), 0);
  const ytdCustomers  = activeMonths.reduce((s, m) => s + (m.customers|| 0), 0);
  const ytdSessions   = activeMonths.reduce((s, m) => s + (m.sessions || 0), 0);

  const output = {
    updated:  new Date().toISOString(),
    fy:       'FY26',
    fyLabel:  'Aug 2025 – Jul 2026',
    monthly,
    topProducts,
    summary: {
      ytdRevenue:    Math.round(ytdRevenue  * 100) / 100,
      ytdOrders,
      ytdSessions:   ytdSessions || null,
      avgAOV:        ytdOrders  ? Math.round((ytdRevenue  / ytdOrders)  * 100) / 100 : 0,
      avgRepeatRate: ytdCustomers ? Math.round((ytdReturning / ytdCustomers) * 1000) / 1000 : 0,
      ytdReturning,
      ytdCustomers,
    },
  };

  // Write to repo root
  const outPath = path.join(__dirname, '..', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ data.json written successfully`);
  console.log(`  YTD Revenue: £${ytdRevenue.toFixed(2)}`);
  console.log(`  YTD Orders:  ${ytdOrders}`);
  console.log(`  Avg AOV:     £${(ytdOrders ? ytdRevenue/ytdOrders : 0).toFixed(2)}`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

main().catch(e => { console.error('\n✗ Fatal error:', e); process.exit(1); });
