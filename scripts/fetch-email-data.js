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

async function klaviyoGet(endpoint, attempt = 1) {
  const resp = await fetch(`${KLAVIYO_BASE}/${endpoint}`, {
    headers: {
      'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
      'revision':      KLAVIYO_REVISION,
    },
  });
  if (resp.status === 429 && attempt <= 4) {
    // Rate-limited — back off and retry rather than silently failing.
    const retryAfter = Number(resp.headers.get('retry-after')) || attempt * 2;
    console.log(`    ⏳ rate limited on ${endpoint}, retrying in ${retryAfter}s (attempt ${attempt})`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return klaviyoGet(endpoint, attempt + 1);
  }
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(`Klaviyo ${endpoint} failed: ${resp.status} ${JSON.stringify(json)}`);
  }
  return json;
}

// ── CAMPAIGN REPORT (last 90 days, all channels — email + SMS) ─
// NOTE: the campaign-values-reports endpoint only returns groupings +
// statistics — it does NOT include the campaign name or send time.
// That's why every row previously showed "Unnamed campaign" with no
// date. We fetch that metadata separately in fetchCampaignMetadata().
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
          'average_order_value', 'conversion_value', 'revenue_per_recipient',
        ],
        // NOTE: no channel filter here on purpose. Klaviyo's own
        // "Campaigns" total (vs. Flows) includes BOTH email and SMS
        // campaigns. Filtering to email-only here was silently dropping
        // SMS campaign revenue, which is why our campaign total came in
        // a bit under Klaviyo's reported figure.
      },
    },
  };
  const json = await klaviyoPost('campaign-values-reports', body);
  return (json.data?.attributes?.results || []).map(r => ({
    id:       r.groupings?.campaign_id,
    name:     null,     // filled in by fetchCampaignMetadata()
    sendTime: null,     // filled in by fetchCampaignMetadata()
    recipients:        r.statistics?.recipients        ?? 0,
    openRate:          r.statistics?.open_rate          ?? null,
    clickRate:         r.statistics?.click_rate         ?? 0,
    conversionRate:    r.statistics?.conversion_rate    ?? 0,
    conversions:       r.statistics?.conversions         ?? 0,
    unsubscribeRate:   r.statistics?.unsubscribe_rate   ?? 0,
    aov:               r.statistics?.average_order_value ?? 0,
    revenue:           r.statistics?.conversion_value    ?? 0,
    revenuePerRecipient: r.statistics?.revenue_per_recipient ?? 0,
  }));
}

// Looks up name / send_time / status for a batch of campaign IDs via
// the single-resource GET endpoint (one call per ID — certain to work,
// vs. guessing at bulk-filter syntax). Runs with limited concurrency
// so we don't trip Klaviyo's rate limit.
async function fetchCampaignMetadata(ids) {
  const map = {};
  let failCount = 0;
  await runWithConcurrency(ids, 3, async (id) => {
    try {
      const json = await klaviyoGet(`campaigns/${id}/?fields[campaign]=name,status,send_time`);
      map[id] = {
        name:     json.data?.attributes?.name || 'Unnamed campaign',
        sendTime: json.data?.attributes?.send_time || null,
        status:   json.data?.attributes?.status || null,
      };
    } catch (e) {
      failCount++;
      console.log(`    ⚠ campaign ${id} metadata lookup FAILED — ${e.message}`);
      map[id] = { name: 'Unnamed campaign', sendTime: null, status: null };
    }
  });
  if (failCount) console.log(`  ⚠ ${failCount}/${ids.length} campaign metadata lookups failed — see errors above`);
  return map;
}

// Simple concurrency-limited runner — avoids hammering the API with
// 30+ simultaneous requests while still being much faster than serial.
async function runWithConcurrency(items, limit, fn) {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// ── FLOW REPORT (last 90 days) ─────────────────────────────────
// NOTE: the previous version read `flow_aggregation` from the response,
// but that key doesn't exist — Klaviyo returns per-flow-message rows
// under `results` (same shape as the campaign report), grouped by
// flow_id + flow_message_id. That's why flow revenue always showed £0:
// it was reading a field that was never there. We now read `results`
// and sum the message-level rows back up to one row per flow.
async function fetchFlowReport() {
  const body = {
    data: {
      type: 'flow-values-report',
      attributes: {
        timeframe: { key: 'last_90_days' },
        conversion_metric_id: PLACED_ORDER_METRIC_ID,
        statistics: [
          'recipients', 'open_rate', 'click_rate', 'conversion_rate', 'conversions',
          'average_order_value', 'conversion_value', 'revenue_per_recipient',
        ],
      },
    },
  };
  const json = await klaviyoPost('flow-values-reports', body);
  const rows = json.data?.attributes?.results || [];

  // Collapse per-message rows into one row per flow_id
  const byFlow = {};
  for (const r of rows) {
    const flowId = r.groupings?.flow_id;
    if (!flowId) continue;
    if (!byFlow[flowId]) {
      byFlow[flowId] = { id: flowId, recipients: 0, conversions: 0, revenue: 0, _openWeighted: 0, _clickWeighted: 0, _convWeighted: 0 };
    }
    const s = r.statistics || {};
    const recip = s.recipients ?? 0;
    byFlow[flowId].recipients   += recip;
    byFlow[flowId].conversions  += s.conversions ?? 0;
    byFlow[flowId].revenue      += s.conversion_value ?? 0;
    byFlow[flowId]._openWeighted += (s.open_rate ?? 0) * recip;
    byFlow[flowId]._clickWeighted += (s.click_rate ?? 0) * recip;
    byFlow[flowId]._convWeighted  += (s.conversion_rate ?? 0) * recip;
  }

  return Object.values(byFlow).map(f => ({
    id: f.id,
    name: null,   // filled in by fetchFlowMetadata()
    status: null, // filled in by fetchFlowMetadata()
    recipients: f.recipients,
    openRate:       f.recipients ? f._openWeighted  / f.recipients : 0,
    clickRate:      f.recipients ? f._clickWeighted / f.recipients : 0,
    conversionRate: f.recipients ? f._convWeighted  / f.recipients : 0,
    conversions: f.conversions,
    aov: f.conversions ? f.revenue / f.conversions : 0,
    revenue: Math.round(f.revenue * 100) / 100,
    revenuePerRecipient: f.recipients ? f.revenue / f.recipients : 0,
  }));
}

// Looks up name / status for a batch of flow IDs, same pattern as
// fetchCampaignMetadata().
async function fetchFlowMetadata(ids) {
  const map = {};
  let failCount = 0;
  await runWithConcurrency(ids, 3, async (id) => {
    try {
      const json = await klaviyoGet(`flows/${id}/?fields[flow]=name,status`);
      map[id] = {
        name:   json.data?.attributes?.name || 'Unnamed flow',
        status: json.data?.attributes?.status || null,
      };
    } catch (e) {
      failCount++;
      console.log(`    ⚠ flow ${id} metadata lookup FAILED — ${e.message}`);
      map[id] = { name: 'Unnamed flow', status: null };
    }
  });
  if (failCount) console.log(`  ⚠ ${failCount}/${ids.length} flow metadata lookups failed — see errors above`);
  return map;
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
  const campaignRows = await fetchCampaignReport();
  console.log(`  ✓ ${campaignRows.length} campaigns`);

  console.log('→ Looking up campaign names + send dates...');
  const campaignMeta = await fetchCampaignMetadata(campaignRows.map(c => c.id).filter(Boolean));
  const campaigns = campaignRows.map(c => ({
    ...c,
    name:     campaignMeta[c.id]?.name     || 'Unnamed campaign',
    sendTime: campaignMeta[c.id]?.sendTime || null,
    status:   campaignMeta[c.id]?.status   || null,
  }));

  console.log('→ Fetching Klaviyo flow report (90d)...');
  const flowRows = await fetchFlowReport();
  console.log(`  ✓ ${flowRows.length} flows`);

  console.log('→ Looking up flow names...');
  const flowMeta = await fetchFlowMetadata(flowRows.map(f => f.id).filter(Boolean));
  const flows = flowRows.map(f => ({
    ...f,
    name:   flowMeta[f.id]?.name   || 'Unnamed flow',
    status: flowMeta[f.id]?.status || null,
  }));

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
    // Newest first — matches how you'd read it in Klaviyo, and means a
    // recent send with a failed name/date lookup still surfaces near the
    // top (by ID recency) rather than sinking to the bottom unnoticed.
    campaigns: campaigns.sort((a, b) => {
      if (a.sendTime && b.sendTime) return new Date(b.sendTime) - new Date(a.sendTime);
      if (a.sendTime) return -1;
      if (b.sendTime) return 1;
      return (b.id || '').localeCompare(a.id || ''); // ULIDs sort chronologically as strings
    }),
    flows: flows.sort((a, b) => b.revenuePerRecipient - a.revenuePerRecipient),
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
