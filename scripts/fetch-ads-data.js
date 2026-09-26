// ============================================================
// ROCK ON RUBY — Paid Ads Data Fetcher
// ------------------------------------------------------------
// Nightly job: pulls DAILY Meta + Google Ads performance (spend,
// conversions, conversion value, clicks, impressions) and writes
// ads-data.json, keyed by calendar date. Reuses the exact same
// Meta/Google Ads credentials already configured for
// fetch-ltv-cac.js — no new GitHub secrets needed.
//
// Re-fetches (and overwrites) the last REFRESH_WINDOW_DAYS days on
// every run, since ad platforms keep finalising attribution for a
// day or two after it ends (a purchase inside a 7-day click window
// can complete after we've already pulled "yesterday"). Anything
// older than that window is written once and never touched again —
// same "never silently rewrite history" rule as data.json.
//
// This script only ever WRITES days it successfully fetched. A day
// that fails for one platform keeps whatever that platform already
// had (or null, if never fetched) — never overwritten with a zero.
// ============================================================

const fs   = require('fs');
const path = require('path');

const META_ACCESS_TOKEN  = process.env.META_ACCESS_TOKEN  || null;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || null;
const META_API_VERSION   = process.env.META_API_VERSION   || 'v25.0';

const GOOGLE_ADS_DEVELOPER_TOKEN   = process.env.GOOGLE_ADS_DEVELOPER_TOKEN   || null;
const GOOGLE_ADS_CLIENT_ID         = process.env.GOOGLE_ADS_CLIENT_ID         || null;
const GOOGLE_ADS_CLIENT_SECRET     = process.env.GOOGLE_ADS_CLIENT_SECRET     || null;
const GOOGLE_ADS_REFRESH_TOKEN     = process.env.GOOGLE_ADS_REFRESH_TOKEN     || null;
const GOOGLE_ADS_CUSTOMER_ID       = process.env.GOOGLE_ADS_CUSTOMER_ID       || null;
const GOOGLE_ADS_LOGIN_CUSTOMER_ID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || null;
const GOOGLE_ADS_API_VERSION       = process.env.GOOGLE_ADS_API_VERSION       || 'v25';

const REFRESH_WINDOW_DAYS = 3;
const OUT_PATH = path.join(__dirname, '..', 'ads-data.json');

// Meta's `actions`/`action_values` arrays report purchases under SEVERAL
// overlapping action_types at once (omni_purchase, offsite_conversion.
// fb_pixel_purchase, purchase, onsite_web_purchase, ...) — these are not
// additive, they're different views of the same sale. Summing every type
// whose name contains "purchase" double/triple counts. Pick ONE canonical
// type instead, preferring the cross-device "omni_purchase" Ads Manager
// itself defaults to, falling back only if an account doesn't report it.
const PURCHASE_ACTION_PRIORITY = ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase'];
function extractPurchaseMetrics(actions, actionValues) {
  const availableTypes = new Set((actions || []).map((a) => a.action_type));
  const chosenType = PURCHASE_ACTION_PRIORITY.find((t) => availableTypes.has(t));
  if (!chosenType) return { conversions: 0, conversionValue: 0 };
  const countRow = (actions || []).find((a) => a.action_type === chosenType);
  const valueRow = (actionValues || []).find((a) => a.action_type === chosenType);
  return { conversions: Number(countRow?.value || 0), conversionValue: Number(valueRow?.value || 0) };
}

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

function loadExisting() {
  if (!fs.existsSync(OUT_PATH)) return { updated: null, days: {} };
  try { return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')); }
  catch { return { updated: null, days: {} }; }
}

// ── META MARKETING API — one day at a time (time_increment=1 keeps
// each row scoped to a single calendar day, matching Google's shape) ──
async function fetchMetaDay(dateStr) {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    return { spend: null, conversions: null, conversionValue: null, clicks: null, impressions: null, source: 'not configured' };
  }
  try {
    const timeRange = encodeURIComponent(JSON.stringify({ since: dateStr, until: dateStr }));
    const fields = 'spend,clicks,impressions,actions,action_values';
    const url = `https://graph.facebook.com/${META_API_VERSION}/act_${META_AD_ACCOUNT_ID}/insights` +
      `?fields=${fields}&time_range=${timeRange}&access_token=${META_ACCESS_TOKEN}`;
    const resp = await fetch(url);
    const json = await resp.json();
    if (!resp.ok || json.error) throw new Error(json.error?.message || `HTTP ${resp.status}`);
    const row = (json.data || [])[0];
    if (!row) return { spend: 0, conversions: 0, conversionValue: 0, clicks: 0, impressions: 0, source: 'Meta Marketing API insights' };

    const { conversions, conversionValue } = extractPurchaseMetrics(row.actions, row.action_values);

    return {
      spend: Math.round(Number(row.spend || 0) * 100) / 100,
      conversions: Math.round(conversions),
      conversionValue: Math.round(conversionValue * 100) / 100,
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      source: 'Meta Marketing API insights',
    };
  } catch (e) {
    console.warn(`  ⚠ Meta fetch failed for ${dateStr}: ${e.message}`);
    return null;
  }
}

// ── GOOGLE ADS API ─────────────────────────────────────────────
async function getGoogleAdsAccessToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_ADS_CLIENT_ID,
      client_secret: GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) throw new Error(`OAuth token refresh failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function fetchGoogleDay(dateStr) {
  const configured = GOOGLE_ADS_DEVELOPER_TOKEN && GOOGLE_ADS_CLIENT_ID &&
    GOOGLE_ADS_CLIENT_SECRET && GOOGLE_ADS_REFRESH_TOKEN && GOOGLE_ADS_CUSTOMER_ID;
  if (!configured) {
    return { spend: null, conversions: null, conversionValue: null, clicks: null, impressions: null, source: 'not configured' };
  }
  try {
    const accessToken = await getGoogleAdsAccessToken();
    const query = `SELECT metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.clicks, metrics.impressions ` +
      `FROM customer WHERE segments.date = '${dateStr}'`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
    };
    if (GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers['login-customer-id'] = GOOGLE_ADS_LOGIN_CUSTOMER_ID;

    const resp = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query }) }
    );
    const json = await resp.json();
    if (!resp.ok) throw new Error(JSON.stringify(json));

    const rows = json.results || [];
    const costMicros = rows.reduce((s, r) => s + Number(r.metrics?.costMicros || 0), 0);
    const conversions = rows.reduce((s, r) => s + Number(r.metrics?.conversions || 0), 0);
    const conversionValue = rows.reduce((s, r) => s + Number(r.metrics?.conversionsValue || 0), 0);
    const clicks = rows.reduce((s, r) => s + Number(r.metrics?.clicks || 0), 0);
    const impressions = rows.reduce((s, r) => s + Number(r.metrics?.impressions || 0), 0);

    return {
      spend: Math.round((costMicros / 1_000_000) * 100) / 100,
      conversions: Math.round(conversions),
      conversionValue: Math.round(conversionValue * 100) / 100,
      clicks, impressions,
      source: 'Google Ads API GAQL',
    };
  } catch (e) {
    console.warn(`  ⚠ Google Ads fetch failed for ${dateStr}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('=== ROR Dashboard — Paid Ads Data Fetch ===');
  const existing = loadExisting();
  const days = existing.days || {};

  const targets = [];
  for (let i = 1; i <= REFRESH_WINDOW_DAYS; i++) targets.push(dateKey(daysAgo(i)));

  for (const dateStr of targets) {
    console.log(`→ ${dateStr}`);
    const [meta, google] = await Promise.all([fetchMetaDay(dateStr), fetchGoogleDay(dateStr)]);
    const prior = days[dateStr] || {};
    days[dateStr] = {
      meta: meta || prior.meta || null,
      google: google || prior.google || null,
    };
    if (meta) console.log(`  ✓ Meta: £${meta.spend} spend, ${meta.conversions} conversions`);
    if (google) console.log(`  ✓ Google: £${google.spend} spend, ${google.conversions} conversions`);
  }

  const output = { updated: new Date().toISOString(), days };
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ ads-data.json written — ${Object.keys(days).length} day(s) on file`);
}

main().catch((e) => { console.error('\n✗ Fatal error:', e); process.exit(1); });
