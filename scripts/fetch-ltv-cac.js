// ============================================================
// ROCK ON RUBY — LTV:CAC Fetcher v3
// Pulls blended ad spend from Meta + Google Ads and combines it with
// order-side data already sitting in data.json (written by
// fetch-data.js, which must run first in the same Action) to produce
// TWO LTV:CAC figures.
//
// Methodology (agreed Aug 2026):
//  - CAC is BLENDED: total ad spend (Meta + Google, all channels) ÷
//    new customers acquired in the window. Deliberately not paid-only
//    — blended is the honest number for a business-level goal,
//    paid-only is a channel-performance number.
//  - LTV = AOV × avg orders per customer over the window × gross
//    margin % (costed SKUs). Margin step matters — a ratio built on
//    revenue alone always looks healthier than it really is.
//  - Two windows, per the original brief: "a genuine lifetime figure
//    needs a few years of history behind it — until then it'd be a 12
//    month LTV, which is completely standard."
//      1. ROLLING — trailing 12 completed months, sliding forward
//         every month. This is the headline "12 month LTV" figure.
//      2. CUMULATIVE — as much history as exists, capped at 36
//         months (3 years). Right now this is barely more than the
//         rolling window (only ~1 year of history exists at all), but
//         it grows toward the real multi-year lifetime figure as more
//         fiscal years close, with no further code changes needed.
//  - Both are flat, non-cohort figures — a proper cohort LTV (grouped
//    by first-purchase month, tracked forward) is the more correct
//    version long-term, but needs years of history to be meaningful.
//
// A note on "complete" months: a closed fiscal year's monthly array
// can have its LAST month frozen with complete:false/mtd:true, simply
// because that was its state on the final run before the next FY
// took over as "current" (fetch-data.js never touches a past year's
// block again). So `complete` is only trustworthy for data.json's
// CURRENT fiscal year — every month in any OTHER (closed) year is
// real, finished data regardless of what its flag says.
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

const TARGET_RATIO    = 3;    // usual 3:1 benchmark
const MIN_RATIO        = 1;    // below 1:1 = losing money on every customer
const ROLLING_MONTHS   = 12;
const CUMULATIVE_CAP   = 36;   // 3 years

// ── DATE HELPERS ─────────────────────────────────────────────
function firstDayOfMonthKey(key) {
  return `${key}-01`;
}
function lastDayOfMonthKey(key) {
  const [y, m] = key.split('-').map(Number); // m is 1-based
  const day = new Date(y, m, 0).getDate();    // day 0 of month m = last day of month m-1 (0-based) = month m (1-based)
  const pad = n => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(day)}`;
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

// ── COMPLETED MONTHS ACROSS ALL FISCAL YEARS ────────────────────
function loadCompletedMonths() {
  const dataPath = path.join(__dirname, '..', 'data.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  return Object.entries(raw.years || {})
    .flatMap(([fyKey, block]) =>
      (block.monthly || []).filter(m => fyKey === raw.currentFY ? m.complete : true)
    )
    .sort((a, b) => a.key.localeCompare(b.key));
}

// ── AGGREGATE A SLICE OF MONTHS INTO ONE LTV:CAC WINDOW ─────────
function aggregateWindow(months) {
  if (!months.length) return null;

  const totalOrders      = months.reduce((s, m) => s + (m.orders    || 0), 0);
  const totalCustomers   = months.reduce((s, m) => s + (m.customers || 0), 0);
  const totalReturning   = months.reduce((s, m) => s + (m.returning || 0), 0);
  const aovNumerator     = months.reduce((s, m) => s + ((m.aov || 0) * (m.orders || 0)), 0);
  const totalCogs        = months.reduce((s, m) => s + (m.costOfGoodsSold || 0), 0);
  const totalGrossProfit = months.reduce((s, m) => s + (m.grossProfit || 0), 0);
  const costedRevenue    = totalCogs + totalGrossProfit;

  return {
    monthsUsed:        months.length,
    since:             firstDayOfMonthKey(months[0].key),
    until:             lastDayOfMonthKey(months[months.length - 1].key),
    avgAOV:            totalOrders ? Math.round((aovNumerator / totalOrders) * 100) / 100 : null,
    ordersPerCustomer: totalCustomers ? Math.round((totalOrders / totalCustomers) * 100) / 100 : null,
    marginPct:         costedRevenue ? Math.round((totalGrossProfit / costedRevenue) * 1000) / 1000 : null,
    newCustomers:      Math.max(0, totalCustomers - totalReturning),
    totalCustomers,
    totalOrders,
  };
}

// ── FETCH AD SPEND + COMPUTE LTV:CAC FOR ONE WINDOW ──────────────
async function buildWindowResult(label, orderSide, monthsCap) {
  console.log(`→ Fetching Meta ad spend (${label}, ${orderSide.since} → ${orderSide.until})...`);
  const meta = await fetchMetaSpend(orderSide.since, orderSide.until);
  console.log(meta.spend != null ? `  ✓ £${meta.spend}` : `  – ${meta.source}`);

  console.log(`→ Fetching Google Ads spend (${label})...`);
  const google = await fetchGoogleAdsSpend(orderSide.since, orderSide.until);
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

  return {
    window: {
      since: orderSide.since,
      until: orderSide.until,
      monthsUsed: orderSide.monthsUsed,
      ...(monthsCap ? { monthsCap } : {}),
    },
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
  };
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('=== ROR Dashboard — LTV:CAC Fetch ===');

  const allMonths = loadCompletedMonths();
  if (!allMonths.length) {
    throw new Error('No completed months found in data.json — run fetch-data.js first.');
  }
  console.log(`  ✓ ${allMonths.length} completed month(s) available, ${allMonths[0].key} → ${allMonths[allMonths.length - 1].key}`);

  const rollingMonths    = allMonths.slice(-ROLLING_MONTHS);
  const cumulativeMonths = allMonths.slice(-CUMULATIVE_CAP);

  const rollingOrderSide    = aggregateWindow(rollingMonths);
  const cumulativeOrderSide = aggregateWindow(cumulativeMonths);

  const rolling    = await buildWindowResult('rolling 12mo', rollingOrderSide, null);
  const cumulative = await buildWindowResult('cumulative', cumulativeOrderSide, CUMULATIVE_CAP);

  const output = {
    updated: new Date().toISOString(),
    rolling,
    cumulative,
    goals: { targetRatio: TARGET_RATIO, minRatio: MIN_RATIO },
  };

  const outPath = path.join(__dirname, '..', 'ltv-cac.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log('\n✓ ltv-cac.json written');
  console.log(`  Rolling 12mo    — LTV: ${rolling.ltv != null ? '£' + rolling.ltv : 'n/a'}  CAC: ${rolling.cac != null ? '£' + rolling.cac : 'n/a'}  Ratio: ${rolling.ratio != null ? rolling.ratio + ':1' : 'n/a'}`);
  console.log(`  Cumulative (${cumulativeOrderSide.monthsUsed}mo) — LTV: ${cumulative.ltv != null ? '£' + cumulative.ltv : 'n/a'}  CAC: ${cumulative.cac != null ? '£' + cumulative.cac : 'n/a'}  Ratio: ${cumulative.ratio != null ? cumulative.ratio + ':1' : 'n/a'}`);
}

main().catch(e => { console.error('\n✗ Fatal error:', e); process.exit(1); });
