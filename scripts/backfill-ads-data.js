// ============================================================
// ROCK ON RUBY — Paid Ads historical backfill (ONE-OFF, MANUAL)
// ------------------------------------------------------------
// Bootstraps ads-data.json with real daily history in one run,
// instead of waiting ~a year for fetch-ads-data.js's nightly rolling
// window to accumulate enough for a YoY comparison. Both Meta and
// Google Ads support querying a bulk date range broken down by day
// in a single API call each, so this isn't 400 separate requests.
//
// Usage: node scripts/backfill-ads-data.js [days] [--force]
//   days    - how many days of history to pull (default 400)
//   --force - overwrite days that already exist in ads-data.json
//             (default: skip days already on file, so re-running
//             this after fetch-ads-data.js has been running nightly
//             for a while doesn't clobber its more-recent numbers)
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

const OUT_PATH = path.join(__dirname, '..', 'ads-data.json');

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

// See fetch-ads-data.js for why this can't just sum every action_type
// matching /purchase/i — Meta reports the same sale under several
// overlapping types (omni_purchase, offsite_conversion.fb_pixel_purchase,
// purchase, ...), so summing them all double/triple counts.
const PURCHASE_ACTION_PRIORITY = ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase'];
function extractPurchaseMetrics(actions, actionValues) {
  const availableTypes = new Set((actions || []).map((a) => a.action_type));
  const chosenType = PURCHASE_ACTION_PRIORITY.find((t) => availableTypes.has(t));
  if (!chosenType) return { conversions: 0, conversionValue: 0 };
  const countRow = (actions || []).find((a) => a.action_type === chosenType);
  const valueRow = (actionValues || []).find((a) => a.action_type === chosenType);
  return { conversions: Number(countRow?.value || 0), conversionValue: Number(valueRow?.value || 0) };
}

// ── META — one bulk call, time_increment=1 gives one row per day ──
async function fetchMetaRange(since, until) {
  if (!META_ACCESS_TOKEN || !META_AD_ACCOUNT_ID) {
    console.warn('  – Meta not configured, skipping');
    return {};
  }
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const fields = 'spend,clicks,impressions,actions,action_values';
  const url = `https://graph.facebook.com/${META_API_VERSION}/act_${META_AD_ACCOUNT_ID}/insights` +
    `?fields=${fields}&time_range=${timeRange}&time_increment=1&limit=500&access_token=${META_ACCESS_TOKEN}`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (!resp.ok || json.error) throw new Error(json.error?.message || `HTTP ${resp.status}`);

  const byDate = {};
  for (const row of json.data || []) {
    const { conversions, conversionValue } = extractPurchaseMetrics(row.actions, row.action_values);
    byDate[row.date_start] = {
      spend: Math.round(Number(row.spend || 0) * 100) / 100,
      conversions: Math.round(conversions),
      conversionValue: Math.round(conversionValue * 100) / 100,
      clicks: Number(row.clicks || 0),
      impressions: Number(row.impressions || 0),
      source: 'Meta Marketing API insights (backfill)',
    };
  }
  return byDate;
}

// ── GOOGLE ADS — one bulk GAQL query, grouped by segments.date ────
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

async function fetchGoogleRange(since, until) {
  const configured = GOOGLE_ADS_DEVELOPER_TOKEN && GOOGLE_ADS_CLIENT_ID &&
    GOOGLE_ADS_CLIENT_SECRET && GOOGLE_ADS_REFRESH_TOKEN && GOOGLE_ADS_CUSTOMER_ID;
  if (!configured) {
    console.warn('  – Google Ads not configured, skipping');
    return {};
  }
  const accessToken = await getGoogleAdsAccessToken();
  const query = `SELECT segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.clicks, metrics.impressions ` +
    `FROM customer WHERE segments.date BETWEEN '${since}' AND '${until}' ORDER BY segments.date`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
  };
  if (GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers['login-customer-id'] = GOOGLE_ADS_LOGIN_CUSTOMER_ID;

  const byDate = {};
  let pageToken = null;
  do {
    const resp = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query, pageToken: pageToken || undefined }) }
    );
    const json = await resp.json();
    if (!resp.ok) throw new Error(JSON.stringify(json));
    for (const row of json.results || []) {
      const d = row.segments.date;
      const cur = byDate[d] || { spend: 0, conversions: 0, conversionValue: 0, clicks: 0, impressions: 0 };
      cur.spend += Number(row.metrics?.costMicros || 0) / 1_000_000;
      cur.conversions += Number(row.metrics?.conversions || 0);
      cur.conversionValue += Number(row.metrics?.conversionsValue || 0);
      cur.clicks += Number(row.metrics?.clicks || 0);
      cur.impressions += Number(row.metrics?.impressions || 0);
      byDate[d] = cur;
    }
    pageToken = json.nextPageToken || null;
  } while (pageToken);

  for (const d of Object.keys(byDate)) {
    byDate[d].spend = Math.round(byDate[d].spend * 100) / 100;
    byDate[d].conversions = Math.round(byDate[d].conversions);
    byDate[d].conversionValue = Math.round(byDate[d].conversionValue * 100) / 100;
    byDate[d].source = 'Google Ads API GAQL (backfill)';
  }
  return byDate;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const daysArg = args.find((a) => /^\d+$/.test(a));
  const backfillDays = daysArg ? Number(daysArg) : 400;

  console.log(`=== ROR Dashboard — Paid Ads Backfill (${backfillDays} days${force ? ', --force' : ''}) ===`);

  const since = dateKey(daysAgo(backfillDays));
  const until = dateKey(daysAgo(1)); // through yesterday — today isn't finished
  console.log(`Range: ${since} → ${until}`);

  console.log('→ Fetching Meta (bulk, one call)...');
  const metaByDate = await fetchMetaRange(since, until);
  console.log(`  ✓ ${Object.keys(metaByDate).length} day(s) returned`);

  console.log('→ Fetching Google Ads (bulk, one call)...');
  const googleByDate = await fetchGoogleRange(since, until);
  console.log(`  ✓ ${Object.keys(googleByDate).length} day(s) returned`);

  let existing = { updated: null, days: {} };
  if (fs.existsSync(OUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')); } catch { /* start fresh */ }
  }
  const days = existing.days || {};

  let written = 0, skipped = 0;
  const allDates = new Set([...Object.keys(metaByDate), ...Object.keys(googleByDate)]);
  for (const d of allDates) {
    if (days[d] && !force) { skipped++; continue; }
    days[d] = { meta: metaByDate[d] || days[d]?.meta || null, google: googleByDate[d] || days[d]?.google || null };
    written++;
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify({ updated: new Date().toISOString(), days }, null, 2));
  console.log(`\n✓ ads-data.json written — ${written} day(s) added/updated, ${skipped} already on file (skipped, use --force to overwrite)`);
  console.log(`  Total days on file: ${Object.keys(days).length}`);
}

main().catch((e) => { console.error('\n✗ Fatal error:', e); process.exit(1); });
