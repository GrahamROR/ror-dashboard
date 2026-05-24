// ============================================================
// ROCK ON RUBY — Dashboard Data Fetcher v2
// Fixed: removed status=any and created_at_max which were
// causing the new Shopify token to return partial data
// ============================================================

const fs      = require('fs');
const path    = require('path');
const { google } = require('googleapis');

// ── CONFIG ───────────────────────────────────────────────────
const SHOPIFY_STORE   = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN   = process.env.SHOPIFY_TOKEN;
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const GA4_CREDENTIALS = process.env.GA4_CREDENTIALS
  ? JSON.parse(process.env.GA4_CREDENTIALS)
  : null;

// ── FINANCIAL YEAR ────────────────────────────────────────────
const FY_START   = '2025-08-01';
const TODAY      = new Date().toISOString().split('T')[0];
const THIS_MONTH = TODAY.slice(0, 7);

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
  const headers = {
    'X-Shopify-Access-Token': SHOPIFY_TOKEN,
    'Content-Type': 'application/json',
  };

  let allOrders = [];

  // KEY FIX: removed status=any and created_at_max
  // Using financial_status=paid only — works correctly with new token type
  let url = `${base}/orders.json?financial_status=paid` +
            `&created_at_min=${FY_START}` +
            `&limit=250` +
            `&fields=created_at,current_total_price,customer,line_items`;

  console.log(`  Starting fetch from: ${FY_START}`);

  while (url) {
    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Shopify API ${resp.status}: ${body}`);
    }

    const data = await resp.json();
    const batch = data.orders || [];
    allOrders = allOrders.concat(batch);
    console.log(`  Fetched ${allOrders.length} orders so far...`);

    // Pagination via Link header
    const link  = resp.headers.get('Link') || '';
    const next  = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
    if (url) await sleep(300);
  }

  // Log the date range of what we actually got
  if (allOrders.length > 0) {
    const dates = allOrders.map(o => o.created_at).sort();
    console.log(`  Date range: ${dates[0].slice(0,10)} → ${dates[dates.length-1].slice(0,10)}`);
  }

  return allOrders;
}

function aggregateOrders(orders) {
  const buckets = {};
  FY_MONTHS.forEach(m => {
    buckets[m.key] = { revenue:0, orders:0, customerIds:new Set(), returning:0 };
  });

  const products = {};

  orders.forEach(order => {
    const monthKey = order.created_at.slice(0, 7);
    if (!buckets[monthKey]) return;

    const b = buckets[monthKey];
    b.revenue += parseFloat(order.current_total_price || 0);
    b.orders  += 1;

    if (order.customer?.id) {
      b.customerIds.add(String(order.customer.id));
      if ((order.customer.orders_count || 0) > 1) b.returning += 1;
    }

    (order.line_items || []).forEach(item => {
      const name = item.title || 'Unknown';
      if (!products[name]) products[name] = { revenue:0, orders:0 };
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
  const analyticsData = google.analyticsdata({ version:'v1beta', auth });
  const sessions = {};

  for (const m of FY_MONTHS) {
    if (m.key > THIS_MONTH) { sessions[m.key] = null; continue; }
    const endDate   = m.key === THIS_MONTH ? TODAY : m.end;
    const startDate = m.key + '-01';

    try {
      const res = await analyticsData.properties.runReport({
        property: `properties/${GA4_PROPERTY_ID}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          metrics:    [{ name:'sessions' }],
        },
      });
      sessions[m.key] = parseInt(
        res.data?.rows?.[0]?.metricValues?.[0]?.value || '0', 10
      );
      console.log(`  GA4 ${m.label}: ${sessions[m.key]} sessions`);
    } catch(e) {
      console.error(`  GA4 error ${m.label}:`, e.message);
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

  console.log('\n→ Fetching Shopify orders for FY26...');
  const orders = await fetchAllOrders();
  console.log(`  Total orders fetched: ${orders.length}`);

  if (orders.length < 1000) {
    console.warn(`  ⚠ Warning: Expected ~7000 orders but got ${orders.length}. Check token scope.`);
  }

  const { buckets, products } = aggregateOrders(orders);

  console.log('\n→ Fetching GA4 sessions...');
  const sessionsByMonth = await fetchGA4Sessions();

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

  // Log monthly breakdown for verification
  console.log('\n  Monthly revenue breakdown:');
  monthly.filter(m=>!m.future).forEach(m=>{
    console.log(`  ${m.label}: £${m.revenue?.toFixed(2)||'—'} (${m.orders||0} orders)`);
  });

  const topProducts = Object.entries(products)
    .map(([name,d]) => ({ name, revenue:Math.round(d.revenue*100)/100, orders:d.orders }))
    .sort((a,b) => b.revenue - a.revenue)
    .slice(0, 10);

  const active       = monthly.filter(m=>!m.future);
  const ytdRevenue   = active.reduce((s,m)=>s+(m.revenue||0),0);
  const ytdOrders    = active.reduce((s,m)=>s+(m.orders||0),0);
  const ytdReturning = active.reduce((s,m)=>s+(m.returning||0),0);
  const ytdCustomers = active.reduce((s,m)=>s+(m.customers||0),0);
  const ytdSessions  = active.reduce((s,m)=>s+(m.sessions||0),0);

  const output = {
    updated:  new Date().toISOString(),
    fy:       'FY26',
    fyLabel:  'Aug 2025 – Jul 2026',
    monthly,
    topProducts,
    summary: {
      ytdRevenue:    Math.round(ytdRevenue*100)/100,
      ytdOrders,
      ytdSessions:   ytdSessions || null,
      avgAOV:        ytdOrders ? Math.round((ytdRevenue/ytdOrders)*100)/100 : 0,
      avgRepeatRate: ytdCustomers ? Math.round((ytdReturning/ytdCustomers)*1000)/1000 : 0,
      ytdReturning,
      ytdCustomers,
    },
  };

  const outPath = path.join(__dirname, '..', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✓ data.json written`);
  console.log(`  YTD Revenue: £${ytdRevenue.toFixed(2)}`);
  console.log(`  YTD Orders:  ${ytdOrders}`);
  console.log(`  Avg AOV:     £${(ytdOrders?ytdRevenue/ytdOrders:0).toFixed(2)}`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
main().catch(e => { console.error('\n✗ Fatal error:', e); process.exit(1); });
