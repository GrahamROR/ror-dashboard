// ============================================================
// ROCK ON RUBY — LTV:CAC Fetcher v2
// Pulls blended ad spend from Meta + Google Ads for ROR's last fully
// completed fiscal year (Aug 1 → Jul 31), and combines it with that
// same year's order-side summary already sitting in data.json
// (written by fetch-data.js, which must run first in the same Action).
//
// Methodology (agreed Aug 2026):
//  - Window is the last COMPLETE fiscal year, not a rolling trailing
//    window. ROR's tax year runs Aug–Jul, same as every other metric
//    on the dashboard (Overview/Monthly/Margin/Products all already
//    key off this fiscal calendar in fetch-data.js) — LTV:CAC now
//    matches rather than running on its own arbitrary clock. Using a
//    closed year (not the in-progress one) also means this is always
//    a full, unskewed 12 months, never a partial period.
//  - CAC is BLENDED: total ad spend (Meta + Google, all channels) ÷
//    new customers acquired in that year. Deliberately not paid-only —
//    blended is the honest number for a business-level goal, paid-only
//    is a channel-performance number.
//  - LTV = AOV × avg orders per customer over the year × gross margin %
//    (costed SKUs). Margin step matters — a ratio built on revenue
//    alone always looks healthier than it really is.
//  - This is a flat, whole-year figure, not a proper cohort LTV. A
//    genuine cohort LTV (grouped by first-purchase month, tracked
//    forward) is the more correct version long-term, but needs a few
//    years of history to be meaningful.
//  - The window only advances once a year, at each FY close (e.g.
//    stays "FY26" until Aug 1 2027) — ad spend and customer numbers
//    still refresh nightly within that same fixed window until then.
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

// ── FISCAL YEAR (mirrors fetch-data.js's computeFiscalYear exactly) ──
// ROR's fiscal year runs Aug → Jul. This returns the CURRENT (in
// progress) FY for a given date — main() below steps that back one
// year to get the last COMPLETE FY, which is what LTV:CAC reports on.
function computeFiscalYear(now) {
  const month     = now.getMonth(); // 0 = Jan … 7 = Aug
  const startYear = month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const endYear   = startYear + 1;
  const pad2      = n => String(n).slice(-2);
  return {
    FY_KEY:   `FY${pad2(endYear)}`,
    FY_START: `${startYear}-08-01`,
    FY_END:   `${endYear}-07-31`,
    FY_LABEL: `Aug ${startYear} – Jul ${endYear}`,
  };
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

// ── ORDER-SIDE NUMBERS FOR THE LAST COMPLETE FY (from data.json) ──
// A closed year's summary block already holds full-year totals (its
// "ytd" fields simply equal the whole year, since the year is over) —
// no need to reconstruct anything from the monthly array.
function loadCompletedFY(prevFY) {
  const dataPath = path.join(__dirname, '..', 'data.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const block = raw.years?.[prevFY.FY_KEY];
  if (!block?.summary) return null;

  const s = block.summary;
  const costedRevenue = (s.ytdCostOfGoodsSold || 0) + (s.ytdGrossProfit || 0);

  return {
    avgAOV:            s.avgAOV ?? null,
    ordersPerCustomer: s.ytdCustomers ? Math.round((s.ytdOrders / s.ytdCustomers) * 100) / 100 : null,
    marginPct:         costedRevenue ? Math.round((s.ytdGrossProfit / costedRevenue) * 1000) / 1000 : null,
    newCustomers:      Math.max(0, (s.ytdCustomers || 0) - (s.ytdReturning || 0)),
    totalCustomers:    s.ytdCustomers || 0,
    totalOrders:       s.ytdOrders || 0,
  };
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('=== ROR Dashboard — LTV:CAC Fetch ===');

  const currentFY = computeFiscalYear(new Date());
  // Step back one fiscal year explicitly (can't just subtract from the
  // FY_START Date — fiscal years aren't a fixed number of days apart
  // in a way that arithmetic on a Date object would get right).
  const prevFY = (() => {
    const startYear = Number(currentFY.FY_START.slice(0, 4)) - 1;
    const endYear = startYear + 1;
    const pad2 = n => String(n).slice(-2);
    return {
      FY_KEY:   `FY${pad2(endYear)}`,
      FY_START: `${startYear}-08-01`,
      FY_END:   `${endYear}-07-31`,
      FY_LABEL: `Aug ${startYear} – Jul ${endYear}`,
    };
  })();

  const orderSide = loadCompletedFY(prevFY);
  if (!orderSide) {
    throw new Error(`No completed fiscal year (${prevFY.FY_KEY}) found in data.json — run fetch-data.js first, or check back once a full FY has closed.`);
  }
  console.log(`  ✓ Reporting on ${prevFY.FY_KEY} (${prevFY.FY_LABEL}) — last complete fiscal year`);

  console.log('→ Fetching Meta ad spend...');
  const meta = await fetchMetaSpend(prevFY.FY_START, prevFY.FY_END);
  console.log(meta.spend != null ? `  ✓ £${meta.spend}` : `  – ${meta.source}`);

  console.log('→ Fetching Google Ads spend...');
  const google = await fetchGoogleAdsSpend(prevFY.FY_START, prevFY.FY_END);
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
    window: {
      fyKey:   prevFY.FY_KEY,
      fyLabel: prevFY.FY_LABEL,
      since:   prevFY.FY_START,
      until:   prevFY.FY_END,
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
