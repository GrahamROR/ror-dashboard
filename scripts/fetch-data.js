// ============================================================
// ROCK ON RUBY — Dashboard Data Fetcher v4
// INCREMENTAL approach — only fetches yesterday's orders
// and updates the existing data.json rather than rebuilding
// from scratch. Solves the historical data access problem
// with Shopify's new token system permanently.
// ============================================================

const fs   = require('fs');
const path = require('path');
const { google } = require('googleapis');

// ── CONFIG ───────────────────────────────────────────────────
const SHOPIFY_STORE     = process.env.SHOPIFY_STORE;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_SECRET    = process.env.SHOPIFY_CLIENT_SECRET;
const GA4_PROPERTY_ID   = process.env.GA4_PROPERTY_ID;
const GA4_CREDENTIALS   = process.env.GA4_CREDENTIALS
  ? JSON.parse(process.env.GA4_CREDENTIALS)
  : null;

// ── DATE HELPERS ─────────────────────────────────────────────
function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = n => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return {
    dateStr:  `${y}-${m}-${day}`,
    monthKey: `${y}-${m}`,
  };
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

// ── FETCH YESTERDAY'S ORDERS ──────────────────────────────────
// Only fetches one day — always within the new token's access window
async function fetchYesterdayOrders(token, dateStr) {
  const base    = `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2024-01`;
  const headers = { 'X-Shopify-Access-Token': token };

  const start = `${dateStr}T00:00:00+00:00`;
  const end   = `${dateStr}T23:59:59+00:00`;

  let allOrders = [];
  let url = `${base}/orders.json?financial_status=paid` +
            `&created_at_min=${start}&created_at_max=${end}` +
            `&limit=250` +
            `&fields=created_at,current_subtotal_price,customer`;

  while (url) {
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Shopify API ${resp.status}: ${body}`);
    }
    const data  = await resp.json();
    allOrders   = allOrders.concat(data.orders || []);
    const link  = resp.headers.get('Link') || '';
    const next  = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  return allOrders;
}

// ── FETCH YESTERDAY'S GA4 SESSIONS ───────────────────────────
async function fetchYesterdaySessions(dateStr) {
  if (!GA4_CREDENTIALS || !GA4_PROPERTY_ID) return null;

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: GA4_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    const analyticsData = google.analyticsdata({ version: 'v1beta', auth });
    const res = await analyticsData.properties.runReport({
      property: `properties/${GA4_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate: dateStr, endDate: dateStr }],
        metrics:    [{ name: 'sessions' }],
      },
    });
    return parseInt(res.data?.rows?.[0]?.metricValues?.[0]?.value || '0', 10);
  } catch(e) {
    console.warn(`  GA4 warning: ${e.message}`);
    return null;
  }
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
  const { dateStr, monthKey } = getYesterday();
  console.log('=== ROR Dashboard Incremental Update ===');
  console.log(`Updating data for: ${dateStr}`);

  // Load existing data
  console.log('\n→ Loading existing data.json...');
  const existing = loadExistingData();
  console.log(`  Loaded — currently ${existing.summary.ytdOrders} orders YTD`);

  // Get fresh Shopify token
  console.log('\n→ Authenticating with Shopify...');
  const token = await getShopifyToken();

  // Fetch yesterday's orders
  console.log(`\n→ Fetching orders for ${dateStr}...`);
  const orders = await fetchYesterdayOrders(token, dateStr);
  console.log(`  ${orders.length} orders found for yesterday`);

  // Calculate yesterday's figures
  let dayRevenue   = 0;
  let dayReturning = 0;
  const customerIds = new Set();

  orders.forEach(o => {
    dayRevenue += parseFloat(o.current_subtotal_price || 0);
    if (o.customer?.id) {
      customerIds.add(String(o.customer.id));
      if ((o.customer.orders_count || 0) > 1) dayReturning++;
    }
  });

  console.log(`  Revenue: £${dayRevenue.toFixed(2)} | Orders: ${orders.length} | Returning: ${dayReturning}`);

  // Fetch yesterday's sessions
  console.log('\n→ Fetching GA4 sessions...');
  const daySessions = await fetchYesterdaySessions(dateStr);
  console.log(`  Sessions: ${daySessions ?? 'not available'}`);

  // Update the monthly entry in existing data
  const monthly = existing.monthly;
  const monthIdx = monthly.findIndex(m => m.key === monthKey);

  const now = new Date();
  const thisMonthKey = now.toISOString().slice(0, 7);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const isMonthComplete = dateStr.slice(8, 10) === String(lastDayOfMonth).padStart(2, '0')
    && monthKey < thisMonthKey;

  if (monthIdx === -1) {
    console.warn(`  Month ${monthKey} not found in data.json — skipping update`);
  } else {
    const m = monthly[monthIdx];
    // Add yesterday's data to the month
    m.revenue   = Math.round(((m.revenue   || 0) + dayRevenue)            * 100) / 100;
    m.orders    = (m.orders    || 0) + orders.length;
    m.customers = (m.customers || 0) + customerIds.size;
    m.returning = (m.returning || 0) + dayReturning;
    if (daySessions !== null) m.sessions = (m.sessions || 0) + daySessions;
    m.mtd       = monthKey === thisMonthKey;
    m.complete  = isMonthComplete;
    m.future    = false;
    console.log(`  Updated ${m.label}: now £${m.revenue} (${m.orders} orders)`);
  }

  // Mark previous month as complete if we've moved into a new month
  monthly.forEach((m, i) => {
    if (m.key < thisMonthKey && !m.complete && m.revenue !== null) {
      m.complete = true;
      m.mtd      = false;
    }
  });

  // Recalculate summary from all months
  const active       = monthly.filter(m => !m.future);
  const ytdRevenue   = active.reduce((s, m) => s + (m.revenue   || 0), 0);
  const ytdOrders    = active.reduce((s, m) => s + (m.orders    || 0), 0);
  const ytdReturning = active.reduce((s, m) => s + (m.returning || 0), 0);
  const ytdCustomers = active.reduce((s, m) => s + (m.customers || 0), 0);
  const ytdSessions  = active.some(m => m.sessions)
    ? active.reduce((s, m) => s + (m.sessions || 0), 0)
    : null;

  existing.summary = {
    ytdRevenue:    Math.round(ytdRevenue  * 100) / 100,
    ytdOrders,
    ytdSessions,
    avgAOV:        ytdOrders ? Math.round((ytdRevenue / ytdOrders) * 100) / 100 : 0,
    avgRepeatRate: ytdCustomers ? Math.round((ytdReturning / ytdCustomers) * 1000) / 1000 : 0,
    ytdReturning,
    ytdCustomers,
  };

  existing.updated = new Date().toISOString();

  // Write updated data.json
  const outPath = path.join(__dirname, '..', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));

  console.log('\n✓ data.json updated successfully');
  console.log(`  YTD Revenue: £${existing.summary.ytdRevenue}`);
  console.log(`  YTD Orders:  ${existing.summary.ytdOrders}`);
  console.log(`  Avg AOV:     £${existing.summary.avgAOV}`);
}

main().catch(e => { console.error('\n✗ Fatal error:', e); process.exit(1); });
