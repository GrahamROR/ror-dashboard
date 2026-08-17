// ============================================================
// ROCK ON RUBY — LTV:CAC Fetcher v1
// Pulls blended ad spend from Meta + Google Ads, combines it with
// order-side metrics already sitting in data.json (written by
// fetch-data.js, which must run first in the same Action) to produce
// a trailing-12-(completed)-month LTV:CAC figure.
//
// Methodology (agreed Aug 2026):
//  - CAC is BLENDED: total ad spend (Meta + Google, all channels) ÷
//    new customers acquired in the same window. Deliberately not
//    paid-only — blended is the honest number for a business-level
//    goal, paid-only is a channel-performance number.
//  - LTV = AOV × avg orders per customer over the window × gross
//    margin % (costed SKUs). Margin step matters — a ratio built on
//    revenue alone always looks healthier than it really is.
//  - Window is a FLAT trailing-12-completed-months figure, not a
//    proper cohort. A genuine cohort LTV (grouped by first-purchase
//    month, tracked forward) is the more correct version long-term,
//    but needs a few years of history to be meaningful. Flat 12-month
//    is the standard interim number.
//  - If fewer than 12 completed months exist yet (e.g. early in a new
//    FY), this uses however many are available and records that in
//    monthsUsed — it does not fabricate a full 12 months.
// ============================================================

const fs   = require('fs');
const path = require('path');

// ── CONFIG ───────────────────────────────────────────────────
const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN  || null;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || null; // numeric, no "act_" prefix
const META_API_VERSION   = process.env.META_API_VERSION   || 'v25.0';

const GOOGLE_ADS_DEVELOPER_TOKEN  = process.env.GOOGLE_ADS_DEVELOPER_TOKEN  || null;
const GOOGLE_ADS_CLIENT_ID        = process.env.GOOGLE_ADS_CLIENT_ID        || null;
const GOOGLE_ADS_CLIENT_SECRET    = process.env.GOOGLE_ADS_CLIENT_SECRET    || null;
const GOOGLE_ADS_REFRESH_TOKEN    = process.env.GOOGLE_ADS_REFRESH_TOKEN    || null;
const GOOGLE_ADS_CUSTOMER_ID      = process.env.GOOGLE_ADS_CUSTOMER_ID      || null; // digits only, no dashes
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || null; // only if under an MCC
const GOOGLE_ADS_API_VERSION      = process.env.GOOGLE_ADS_API_VERSION      || 'v25';

const TARGET_RATIO = 3;   // usual 3:1 benchmark
const MIN_RATIO     = 1;   // below 1:1 = losing money on every customer
const WINDOW_MONTHS = 12;

// ── DATE HELPERS ─────────────────────────────────────────────
function isoDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── META MARKETING API ────────────────────────────────────────
// Read-only ads_read insights call — total spend for the ad account
// over an arbitrary date range, no time_increment so Meta returns one
// aggregate row rather than a daily breakdown.
async function fetchMetaSpend(since, until) {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    return { spend: null, source: 'not configured — set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID' };
  }
  try {
    const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
    const url = `https://graph.facebook.com/${META_API_VERSION}/act_${META_AD_ACCOUNT_ID}/insights` +
      `?fields=spend&time_range=${timeRange}&access_token=${META_ACCESS_TOKEN}`;
    const resp = await fetch(url);
    const json = await resp.json();
    if (!resp.ok || json.error) {
      throw new Error(json.error?.message || `HTTP ${resp.status}`);
    }
    const spend = (json.data || []).reduce((s, row) => s + (Number(row.spend) || 0), 0);
    return { spend: Math.round(spend * 100) / 100, source: 'Meta Marketing API insights' };
  } catch (e) {
    console.warn(`  ⚠ Meta spend fetch failed: ${e.message}`);
    return { spend: null, source: `error: ${e.message}` };
  }
}

// ── GOOGLE ADS API ─────────────────────────────────────────────
async function getGoogleAdsAccessToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error(`OAuth token refresh failed: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function fetchGoogleAdsSpend(since, until) {
  const configured = GOOGLE_ADS_DEVELOPER_TOKEN && GOOGLE_ADS_CLIENT_ID &&
    GOOGLE_ADS_CLIENT_SECRET && GOOGLE_ADS_REFRESH_TOKEN && GOOGLE_ADS_CUSTOMER_ID;
  if (!configured) {
    return { spend: null, source: 'not configured — set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID' };
  }
  try {
    const accessToken = await getGoogleAdsAccessToken();
    const query = `SELECT metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${since}' AND '${until}'`;
    const headers = {
      'Content-Type':    'application/json',
      'Authorization':   `Bearer ${accessToken}`,
      'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
    };
    if (GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers['login-customer-id'] = GOOGLE_ADS_LOGIN_CUSTOMER_ID;

    const resp = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query }) }
    );
    const json = await resp.json();
    if (!resp.ok) {
      throw new Error(JSON.stringify(json));
    }
    const costMicros = (json.results || []).reduce((s, row) => s + Number(row.metrics?.costMicros || 0), 0);
    return { spend: Math.round((costMicros / 1_000_000) * 100) / 100, source: 'Google Ads API GAQL' };
  } catch (e) {
    console.warn(`  ⚠ Google Ads spend fetch failed: ${e.message}`);
    return { spend: null, source: `error: ${e.message}` };
  }
}

// ── ORDER-SIDE TRAILING WINDOW (from data.json, already written by fetch-data.js) ──
// Flattens monthly arrays across every FY block, keeps only completed
// months (excludes the in-progress MTD month and future months so a
// partial month never skews AOV/margin), sorts chronologically, and
// takes the most recent WINDOW_MONTHS. This deliberately spans FY
// boundaries — FY27's first completed month picks up right where
// FY26's last one left off.
function loadTrailingWindow() {
  const dataPath = path.join(__dirname, '..', 'data.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const allMonths = Object.values(raw.years || {})
    .flatMap(block => block.monthly || [])
    .filter(m => m.complete)
    .sort((a, b) => a.key.localeCompare(b.key));

  const window = allMonths.slice(-WINDOW_MONTHS);
  if (!window.length) return null;

  const totalOrders    = window.reduce((s, m) => s + (m.orders    || 0), 0);
  const totalCustomers = window.reduce((s, m) => s + (m.customers || 0), 0);
  const totalReturning = window.reduce((s, m) => s + (m.returning || 0), 0);
  const aovNumerator   = window.reduce((s, m) => s + ((m.aov || 0) * (m.orders || 0)), 0);
  const totalCogs      = window.reduce((s, m) => s + (m.costOfGoodsSold || 0), 0);
  const totalGrossProfit = window.reduce((s, m) => s + (m.grossProfit || 0), 0);
  const costedRevenue  = totalCogs + totalGrossProfit;

  return {
    monthsUsed:       window.length,
    since:            window[0].key,
    until:            window[window.length - 1].key,
    avgAOV:           totalOrders ? Math.round((aovNumerator / totalOrders) * 100) / 100 : null,
    ordersPerCustomer: totalCustomers ? Math.round((totalOrders / totalCustomers) * 100) / 100 : null,
    marginPct:        costedRevenue ? Math.round((totalGrossProfit / costedRevenue) * 1000) / 1000 : null,
    newCustomers:      Math.max(0, totalCustomers - totalReturning),
    totalCustomers,
    totalOrders,
  };
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('=== ROR Dashboard — LTV:CAC Fetch ===');

  const orderSide = loadTrailingWindow();
  if (!orderSide) {
    throw new Error('No completed months found in data.json — run fetch-data.js first.');
  }
  console.log(`  ✓ Order-side window: ${orderSide.monthsUsed} completed month(s), ${orderSide.since} → ${orderSide.until}`);

  // Ad spend query window mirrors the order-side window (same calendar
  // span) so LTV and CAC are measuring the same period, not two
  // different clocks.
  const until = isoDate(new Date());
  const since = isoDate(new Date(Date.now() - orderSide.monthsUsed * 30.44 * 24 * 60 * 60 * 1000));

  console.log('→ Fetching Meta ad spend...');
  const meta = await fetchMetaSpend(since, until);
  console.log(meta.spend != null ? `  ✓ £${meta.spend}` : `  – ${meta.source}`);

  console.log('→ Fetching Google Ads spend...');
  const google = await fetchGoogleAdsSpend(since, until);
  console.log(google.spend != null ? `  ✓ £${google.spend}` : `  – ${google.source}`);

  const spendKnown = [meta.spend, google.spend].filter(v => v != null);
  const blendedSpend = spendKnown.length ? Math.round(spendKnown.reduce((s, v) => s + v, 0) * 100) / 100 : null;

  const ltv = (orderSide.avgAOV != null && orderSide.ordersPerCustomer != null && orderSide.marginPct != null)
    ? Math.round(orderSide.avgAOV * orderSide.ordersPerCustomer * orderSide.marginPct * 100) / 100
    : null;

  const cac = (blendedSpend != null && orderSide.newCustomers)
    ? Math.round((blendedSpend / orderSide.newCustomers) * 100) / 100
    : null;

  const ratio = (ltv != null && cac) ? Math.round((ltv / cac) * 100) / 100 : null;

  const output = {
    updated: new Date().toISOString(),
    window: { since, until, monthsUsed: orderSide.monthsUsed, monthsTarget: WINDOW_MONTHS },
    adSpend: { meta, google, blended: blendedSpend },
    customerMetrics: {
      avgAOV:            orderSide.avgAOV,
      ordersPerCustomer: orderSide.ordersPerCustomer,
      marginPct:         orderSide.marginPct,
      newCustomers:      orderSide.newCustomers,
      totalCustomers:    orderSide.totalCustomers,
      totalOrders:       orderSide.totalOrders,
    },
    ltv,
    cac,
    ratio,
    goals: { targetRatio: TARGET_RATIO, minRatio: MIN_RATIO },
  };

  const outPath = path.join(__dirname, '..', 'ltv-cac.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log('\n✓ ltv-cac.json written');
  console.log(`  LTV:  ${ltv != null ? '£' + ltv : 'n/a (needs cost-of-goods data)'}`);
  console.log(`  CAC:  ${cac != null ? '£' + cac : 'n/a (needs ad spend + new customer data)'}`);
  console.log(`  Ratio: ${ratio != null ? ratio + ':1' : 'n/a'} (target ${TARGET_RATIO}:1)`);
}

main().catch(e => { console.error('\n✗ Fatal error:', e); process.exit(1); });
