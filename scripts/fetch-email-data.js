// ============================================================
// ROCK ON RUBY — Email/SMS Dashboard Data Fetcher v1
// Pulls Klaviyo campaign + flow performance (last 90 days) and
// Shopify total_sales for the same window (attribution denominator).
// Writes a SEPARATE file — email-data.json — so this never
// touches the working Shopify/GA4 pull in fetch-data.js.
// ============================================================

const fs   = require('fs');
const path = require('path');

// ── CONFIG ───────────────────────────────────────────────────
const KLAVIYO_API_KEY   = process.env.KLAVIYO_API_KEY;       // private API key
const SHOPIFY_STORE     = process.env.SHOPIFY_STORE;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_SECRET    = process.env.SHOPIFY_CLIENT_SECRET;

// Optional — set once you have it. Get it from the list URL:
// https://www.klaviyo.com/lists/{THIS_ID}
const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID || null;

// "Placed Order" metric — confirmed active ID (the duplicate is XW22KZ, unused).
// Override via env if this ever changes.
const PLACED_ORDER_METRIC_ID = process.env.KLAVIYO_PLACED_ORDER_METRIC_ID || 'URVSjC';

const KLAVIYO_REVISION = '2024-10-15';
const KLAVIYO_BASE     = 'https://a.klaviyo.com/api';

// Goals — mirrors the KPI framework session. Edit here if targets change.
const EMAIL_GOALS = {
  campaignConversion: 0.0007,   // 0.07% — per-recipient, not per-open/click
  aov:                48,
  repeatPurchaseRate: 0.30,     // "re-engagement" = repeat purchase rate
  attribution:        0.30,     // email+SMS revenue as % of total store revenue
  listSize:           50000,
};

// ── KLAVIYO HELPERS ───────────────────────────────────────────
async function klaviyoPost(endpoint, body) {
  const resp = await fetch(`${KLAVIYO_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
      'revision':      KLAVIYO_REVISION,
    },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`Klaviyo ${endpoint} failed: ${resp.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function klaviyoGet(endpoint) {
  const resp = await fetch(`${KLAVIYO_BASE}/${endpoint}`, {
    headers: {
      'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
      'revision':      KLAVIYO_REVISION,
    },
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`Klaviyo ${endpoint} failed: ${resp.status} ${JSON.stringify(json)}`);
  }
  return json;
}

// ── CAMPAIGN REPORT (last 90 days, email channel) ─────────────
async function fetchCampaignReport() {
  const body = {
    data: {
      type: 'campaign-values-report',
      attributes: {
        timeframe: { key: 'last_90_days' },
        conversion_metric_id: PLACED_ORDER_METRIC_ID,
        statistics: [
          'recipients', 'open_rate', 'click_rate', 'click_to_open_rate',
          'conversion_rate', 'conversions', 'unsubscribe_rate', 'spam_complaint_rate',
        ],
        value_statistics: ['average_order_value', 'conversion_value', 'revenue_per_recipient'],
        filter: "equals(send_channel,\"email\")",
      },
    },
  };
  const json = await klaviyoPost('campaign-values-reports', body);
  return (json.data?.attributes?.results || []).map(r => ({
    id:       r.groupings?.campaign_id,
    name:     r.campaign_details?.attributes?.name || 'Unnamed campaign',
    sendTime: r.campaign_details?.attributes?.send_time || null,
    recipients:        r.statistics?.recipients        ?? 0,
    openRate:          r.statistics?.open_rate          ?? 0,
    clickRate:         r.statistics?.click_rate         ?? 0,
    conversionRate:    r.statistics?.conversion_rate    ?? 0,
    conversions:       r.statistics?.conversions         ?? 0,
    unsubscribeRate:   r.statistics?.unsubscribe_rate   ?? 0,
    aov:               r.statistics?.average_order_value ?? 0,
    revenue:           r.statistics?.conversion_value    ?? 0,
    revenuePerRecipient: r.statistics?.revenue_per_recipient ?? 0,
  }));
}

// ── FLOW REPORT (last 90 days, grouped by flow) ────────────────
async function fetchFlowReport() {
  const body = {
    data: {
      type: 'flow-values-report',
      attributes: {
        timeframe: { key: 'last_90_days' },
        conversion_metric_id: PLACED_ORDER_METRIC_ID,
        statistics: ['recipients', 'open_rate', 'click_rate', 'conversion_rate', 'conversions'],
        value_statistics: ['average_order_value', 'conversion_value', 'revenue_per_recipient'],
        group_by: ['flow_name'],
      },
    },
  };
  const json = await klaviyoPost('flow-values-reports', body);
  // flow_aggregation gives one row per flow already summed across messages
  const agg = json.data?.attributes?.flow_aggregation || [];
  return agg.map(r => ({
    id:       r.flow_id,
    name:     r.flow_details?.attributes?.name || 'Unnamed flow',
    status:   r.flow_details?.attributes?.status || null,
    recipients:        r.statistics?.recipients        ?? 0,
    openRate:          r.statistics?.open_rate          ?? 0,
    clickRate:         r.statistics?.click_rate         ?? 0,
    conversionRate:    r.statistics?.conversion_rate    ?? 0,
    conversions:       r.statistics?.conversions         ?? 0,
    aov:               r.statistics?.average_order_value ?? 0,
    revenue:           r.statistics?.conversion_value    ?? 0,
    revenuePerRecipient: r.statistics?.revenue_per_recipient ?? 0,
  }));
}

// ── LIST SIZE (optional — needs KLAVIYO_LIST_ID) ───────────────
async function fetchListSize() {
  if (!KLAVIYO_LIST_ID) return null;
  const json = await klaviyoGet(`lists/${KLAVIYO_LIST_ID}/?additional-fields[list]=profile_count`);
  return json.data?.attributes?.profile_count ?? null;
}

// ── SHOPIFY: total store revenue + repeat purchase rate (90d) ──
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
  const data = await resp.json();
  if (!resp.ok || !data.access_token) throw new Error(`Shopify token failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function fetchShopify90Day(token) {
  const query = `
    query ShopifyQLQuery($query: String!) {
      shopifyqlQuery(query: $query) {
        tableData { rows }
        parseErrors
      }
    }
  `;
  const shopifyql = 'FROM sales SHOW total_sales, orders, returning_customer_rate SINCE -90d UNTIL today';
  const resp = await fetch(
    `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2026-04/graphql.json`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables: { query: shopifyql } }),
    }
  );
  const json = await resp.json();
  const row = json.data?.shopifyqlQuery?.tableData?.rows?.[0] || {};
  return {
    totalSales90d:        row.total_sales            != null ? Math.round(Number(row.total_sales) * 100) / 100 : null,
    orders90d:            row.orders                 != null ? Number(row.orders) : null,
    repeatPurchaseRate90d: row.returning_customer_rate != null ? Number(row.returning_customer_rate) : null,
  };
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  console.log('=== ROR Email Dashboard — fetch v1 ===');

  console.log('\n→ Fetching Klaviyo campaign report (90d)...');
  const campaigns = await fetchCampaignReport();
  console.log(`  ✓ ${campaigns.length} campaigns`);

  console.log('→ Fetching Klaviyo flow report (90d)...');
  const flows = await fetchFlowReport();
  console.log(`  ✓ ${flows.length} flows`);

  console.log('→ Fetching Klaviyo list size...');
  const listSize = await fetchListSize();
  console.log(listSize != null ? `  ✓ ${listSize} profiles` : '  – skipped (set KLAVIYO_LIST_ID to enable)');

  console.log('\n→ Authenticating with Shopify...');
  const token = await getShopifyToken();
  console.log('→ Fetching Shopify 90-day revenue + repeat purchase rate...');
  const shopify90d = await fetchShopify90Day(token);
  console.log(`  ✓ £${shopify90d.totalSales90d} | ${shopify90d.orders90d} orders | ${(shopify90d.repeatPurchaseRate90d*100).toFixed(1)}% repeat`);

  // ── AGGREGATE CAMPAIGN TOTALS ──
  const campRecipients = campaigns.reduce((s, c) => s + c.recipients, 0);
  const campConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const campRevenue    = campaigns.reduce((s, c) => s + c.revenue, 0);
  const campConversionRate = campRecipients ? campConversions / campRecipients : 0;
  const campAOV = campConversions ? campRevenue / campConversions : 0;

  // ── AGGREGATE FLOW TOTALS ──
  const flowRecipients  = flows.reduce((s, f) => s + f.recipients, 0);
  const flowConversions = flows.reduce((s, f) => s + f.conversions, 0);
  const flowRevenue     = flows.reduce((s, f) => s + f.revenue, 0);
  const flowAOV = flowConversions ? flowRevenue / flowConversions : 0;

  // ── EMAIL PROGRAM TOTALS ──
  const totalEmailRevenue = campRevenue + flowRevenue;
  const totalEmailOrders  = campConversions + flowConversions;
  const blendedAOV        = totalEmailOrders ? totalEmailRevenue / totalEmailOrders : 0;
  const attribution       = shopify90d.totalSales90d ? totalEmailRevenue / shopify90d.totalSales90d : null;

  const summary = {
    campaignConversionRate: Math.round(campConversionRate * 100000) / 100000,
    campaignAOV:            Math.round(campAOV * 100) / 100,
    campaignRevenue90d:     Math.round(campRevenue * 100) / 100,
    campaignRecipients90d:  campRecipients,
    flowRevenue90d:          Math.round(flowRevenue * 100) / 100,
    flowAOV:                 Math.round(flowAOV * 100) / 100,
    flowSharePct:            totalEmailRevenue ? Math.round((flowRevenue / totalEmailRevenue) * 1000) / 1000 : null,
    totalEmailRevenue90d:    Math.round(totalEmailRevenue * 100) / 100,
    blendedAOV:              Math.round(blendedAOV * 100) / 100,
    attribution:             attribution != null ? Math.round(attribution * 1000) / 1000 : null,
    repeatPurchaseRate:      shopify90d.repeatPurchaseRate90d,
    totalStoreRevenue90d:    shopify90d.totalSales90d,
    listSize,
  };

  const output = {
    updated:  new Date().toISOString(),
    window:   'last_90_days',
    goals:    EMAIL_GOALS,
    summary,
    campaigns: campaigns.sort((a, b) => b.revenuePerRecipient - a.revenuePerRecipient),
    flows:     flows.sort((a, b) => b.revenuePerRecipient - a.revenuePerRecipient),
  };

  const outPath = path.join(__dirname, '..', 'email-data.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log('\n✓ email-data.json written');
  console.log(`  Campaign conversion: ${(summary.campaignConversionRate*100).toFixed(3)}% (goal 0.07%)`);
  console.log(`  Blended AOV:         £${summary.blendedAOV} (goal £48)`);
  console.log(`  Repeat purchase:     ${(summary.repeatPurchaseRate*100).toFixed(1)}% (goal 30%)`);
  console.log(`  Attribution:         ${summary.attribution != null ? (summary.attribution*100).toFixed(1)+'%' : 'n/a'} (goal 30%)`);
  console.log(`  List size:           ${listSize != null ? listSize : 'not tracked — set KLAVIYO_LIST_ID'} (goal 50,000)`);
}

main().catch(e => { console.error('\n✗ Fatal error:', e); process.exit(1); });
