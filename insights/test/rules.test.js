const assert = require('assert');
const InsightRules = require('../rules.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok - ${name}`); }
  catch (e) { fail++; console.error(`  FAIL - ${name}\n    ${e.message}`); }
}

// ── buildAdsInsight ──────────────────────────────────────────

test('ads: not-occurred period returns neutral verdict, no bullets', () => {
  const r = InsightRules.buildAdsInsight({ current: { status: 'not-occurred' } });
  assert.strictEqual(r.verdict.tone, 'neutral');
  assert.match(r.verdict.text, /hasn't happened yet/);
  assert.deepStrictEqual(r.bullets, []);
});

test('ads: no-data period returns neutral verdict, no bullets', () => {
  const r = InsightRules.buildAdsInsight({ current: { status: 'no-data' } });
  assert.strictEqual(r.verdict.tone, 'neutral');
  assert.match(r.verdict.text, /No ad data recorded/);
});

test('ads: missing current entirely is treated like not-occurred', () => {
  const r = InsightRules.buildAdsInsight({ current: null });
  assert.strictEqual(r.verdict.tone, 'neutral');
  assert.deepStrictEqual(r.bullets, []);
});

test('ads: ROAS up >=10% vs comparison gives good verdict', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 4.4, spend: 1000, conversions: 50 },
    comparisons: { roas: { status: 'ok', percentChange: 12, previous: 3.9 } },
    comparisonLabel: 'the prior period',
  });
  assert.strictEqual(r.verdict.tone, 'good');
  assert.match(r.verdict.text, /Efficiency improved/);
  assert.match(r.verdict.text, /\+12\.0%/);
});

test('ads: ROAS down <=-10% vs comparison gives bad verdict', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.0, spend: 1000, conversions: 50 },
    comparisons: { roas: { status: 'ok', percentChange: -15, previous: 3.5 } },
  });
  assert.strictEqual(r.verdict.tone, 'bad');
  assert.match(r.verdict.text, /Efficiency declined/);
});

test('ads: ROAS change within +/-10% gives neutral "roughly steady" verdict', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.2, spend: 1000, conversions: 50 },
    comparisons: { roas: { status: 'ok', percentChange: 3, previous: 3.1 } },
  });
  assert.strictEqual(r.verdict.tone, 'neutral');
  assert.match(r.verdict.text, /Roughly steady/);
});

test('ads: no comparison data at all falls back to standalone-period verdict', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.2, spend: 1000, conversions: 50 },
    comparisons: { roas: { status: 'no-comparison-data' } },
  });
  assert.strictEqual(r.verdict.tone, 'neutral');
  assert.match(r.verdict.text, /no comparison period/);
});

test('ads: comparison previous had zero spend (percentChange null) is called out explicitly', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.2, spend: 1000, conversions: 50 },
    comparisons: { roas: { status: 'ok', percentChange: null, previous: null } },
  });
  assert.strictEqual(r.verdict.tone, 'neutral');
  assert.match(r.verdict.text, /no meaningful trend/);
});

test('ads: spend up sharply with disproportionately low conversion growth flags as bad', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.0, spend: 2000, conversions: 60 },
    comparisons: {
      roas: { status: 'ok', percentChange: 0, previous: 3.0 },
      spend: { status: 'ok', percentChange: 30 },
      conversions: { status: 'ok', percentChange: 5 },
    },
  });
  const texts = r.bullets.map((b) => b.text).join(' | ');
  assert.match(texts, /Spend is up \+30\.0%/);
  assert.match(texts, /isn't translating/);
});

test('ads: spend down while conversions hold is flagged as good efficiency', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.5, spend: 800, conversions: 55 },
    comparisons: {
      roas: { status: 'ok', percentChange: 5, previous: 3.3 },
      spend: { status: 'ok', percentChange: -15 },
      conversions: { status: 'ok', percentChange: -2 },
    },
  });
  const texts = r.bullets.map((b) => b.text).join(' | ');
  assert.match(texts, /genuinely more efficient/);
});

test('ads: channel efficiency gap >=40% surfaces a watch bullet naming the stronger channel', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.0, spend: 1000, conversions: 50 },
    comparisons: { roas: { status: 'ok', percentChange: 0, previous: 3.0 } },
    meta: { spend: 500, roas: 5.0 },
    google: { spend: 500, roas: 3.0 },
  });
  const gapBullet = r.bullets.find((b) => /converting far more efficiently/.test(b.text));
  assert.ok(gapBullet, 'expected a channel-gap bullet');
  assert.match(gapBullet.text, /Meta is converting far more efficiently than Google/);
});

test('ads: channel gap below MIN_CHANNEL_SPEND guard is suppressed as noise', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.0, spend: 100, conversions: 5 },
    comparisons: { roas: { status: 'ok', percentChange: 0, previous: 3.0 } },
    meta: { spend: 20, roas: 8.0 },
    google: { spend: 20, roas: 1.0 },
  });
  assert.ok(!r.bullets.some((b) => /converting far more efficiently/.test(b.text)));
});

test('ads: per-channel CPA rise >=25% flags bad, fall <=-20% flags good', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.0, spend: 1000, conversions: 50 },
    comparisons: { roas: { status: 'ok', percentChange: 0, previous: 3.0 } },
    metaComparisons: { cpa: { status: 'ok', percentChange: 30, previous: 10, current: 13 } },
    googleComparisons: { cpa: { status: 'ok', percentChange: -25, previous: 20, current: 15 } },
  });
  const texts = r.bullets.map((b) => b.text).join(' | ');
  assert.match(texts, /Meta's cost per conversion rose/);
  assert.match(texts, /Google's cost per conversion fell/);
});

test('ads: platform conversions >= real Shopify orders triggers top-priority over-attribution flag', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.0, spend: 1000, conversions: 120 },
    comparisons: { roas: { status: 'ok', percentChange: 0, previous: 3.0 } },
    shopify: { orders: 100, sessions: 5000, convRate: 0.02 },
  });
  assert.strictEqual(r.bullets[0].tone, 'bad');
  assert.match(r.bullets[0].text, /over-counted attribution/);
});

test('ads: platform conversions comfortably below Shopify orders is flagged as trustworthy (good)', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.0, spend: 1000, conversions: 60 },
    comparisons: { roas: { status: 'ok', percentChange: 0, previous: 3.0 } },
    shopify: { orders: 100, sessions: 5000, convRate: 0.02 },
  });
  const texts = r.bullets.map((b) => b.text).join(' | ');
  assert.match(texts, /reasonably trustworthy/);
});

test('ads: platform conversions in the 85-100% band of Shopify orders is a watch, not bad or good', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.0, spend: 1000, conversions: 92 },
    comparisons: { roas: { status: 'ok', percentChange: 0, previous: 3.0 } },
    shopify: { orders: 100, sessions: 5000, convRate: 0.02 },
  });
  const watchBullet = r.bullets.find((b) => /on the high side/.test(b.text));
  assert.ok(watchBullet);
});

test('ads: bullets are capped at 6 and sorted by score descending', () => {
  const r = InsightRules.buildAdsInsight({
    current: { status: 'ok', roas: 3.0, spend: 2000, conversions: 60 },
    comparisons: {
      roas: { status: 'ok', percentChange: 0, previous: 3.0 },
      spend: { status: 'ok', percentChange: 40 },
      conversions: { status: 'ok', percentChange: 2 },
    },
    meta: { spend: 500, roas: 6.0 },
    google: { spend: 500, roas: 3.0 },
    metaComparisons: { cpa: { status: 'ok', percentChange: 40, previous: 10, current: 14 } },
    googleComparisons: { cpa: { status: 'ok', percentChange: -30, previous: 20, current: 14 } },
    shopify: { orders: 50, sessions: 5000, convRate: 0.02 },
  });
  assert.ok(r.bullets.length <= 6);
  assert.strictEqual(r.bullets[0].tone, 'bad'); // over-attribution, score 1000, should sort first
});

// ── buildOverviewInsight ─────────────────────────────────────

const GOALS = { conversion: 0.035, aov: 48, repeatRate: 0.25 };

test('overview: ahead of YTD goal pace by >=5% gives good verdict', () => {
  const r = InsightRules.buildOverviewInsight({
    summary: { ytdRevenue: 110000, avgAOV: 50, avgConversionRate: 0.04, avgRepeatRate: 0.3 },
    goals: GOALS,
    ytdGoal: 100000,
    monthly: [],
    topProducts: [],
    fyLabel: 'FY2026',
  });
  assert.strictEqual(r.verdict.tone, 'good');
  assert.match(r.verdict.text, /Ahead of the YTD revenue goal/);
});

test('overview: behind YTD goal pace by >=5% gives bad verdict', () => {
  const r = InsightRules.buildOverviewInsight({
    summary: { ytdRevenue: 90000, avgAOV: 50, avgConversionRate: 0.04, avgRepeatRate: 0.3 },
    goals: GOALS,
    ytdGoal: 100000,
    monthly: [],
    topProducts: [],
    fyLabel: 'FY2026',
  });
  assert.strictEqual(r.verdict.tone, 'bad');
  assert.match(r.verdict.text, /Behind the YTD revenue goal/);
});

test('overview: no ytdGoal available falls back to neutral, no-pace-to-compare verdict', () => {
  const r = InsightRules.buildOverviewInsight({
    summary: { ytdRevenue: 90000 },
    goals: GOALS,
    ytdGoal: null,
    monthly: [],
    topProducts: [],
    fyLabel: 'FY2026',
  });
  assert.strictEqual(r.verdict.tone, 'neutral');
  assert.match(r.verdict.text, /no goal pace to compare against yet/);
});

test('overview: AOV well below goal flags bad; conversion rate well below goal flags bad', () => {
  const r = InsightRules.buildOverviewInsight({
    summary: { ytdRevenue: 100000, avgAOV: 35, avgConversionRate: 0.02, avgRepeatRate: 0.3 },
    goals: GOALS,
    ytdGoal: 100000,
    monthly: [],
    topProducts: [],
    fyLabel: 'FY2026',
  });
  const texts = r.bullets.map((b) => b.text).join(' | ');
  assert.match(texts, /AOV is £35/);
  assert.match(texts, /Conversion rate is 2\.00%/);
});

test('overview: repeat rate well below goal flags a watch bullet', () => {
  const r = InsightRules.buildOverviewInsight({
    summary: { ytdRevenue: 100000, avgAOV: 50, avgConversionRate: 0.04, avgRepeatRate: 0.1 },
    goals: GOALS,
    ytdGoal: 100000,
    monthly: [],
    topProducts: [],
    fyLabel: 'FY2026',
  });
  const watch = r.bullets.find((b) => b.tone === 'watch' && /Repeat purchase rate/.test(b.text));
  assert.ok(watch);
});

test('overview: month-on-month revenue drop >=15% between last two completed months flags watch', () => {
  const r = InsightRules.buildOverviewInsight({
    summary: { ytdRevenue: 100000, avgAOV: 50, avgConversionRate: 0.04, avgRepeatRate: 0.3 },
    goals: GOALS,
    ytdGoal: 100000,
    monthly: [
      { label: 'Jun', revenue: 20000, future: false, complete: true },
      { label: 'Jul', revenue: 16000, future: false, complete: true },
      { label: 'Aug', revenue: 0, future: true, complete: false },
    ],
    topProducts: [],
    fyLabel: 'FY2026',
  });
  const watch = r.bullets.find((b) => b.tone === 'watch' && /dropped/.test(b.text));
  assert.ok(watch);
  assert.match(watch.text, /Jun → Jul/);
});

test('overview: top product concentration >=25% of YTD revenue flags a watch bullet', () => {
  const r = InsightRules.buildOverviewInsight({
    summary: { ytdRevenue: 100000, avgAOV: 50, avgConversionRate: 0.04, avgRepeatRate: 0.3 },
    goals: GOALS,
    ytdGoal: 100000,
    monthly: [],
    topProducts: [{ name: 'Ruby Necklace', revenue: 30000 }],
    fyLabel: 'FY2026',
  });
  const watch = r.bullets.find((b) => /concentration risk/.test(b.text));
  assert.ok(watch);
  assert.match(watch.text, /Ruby Necklace/);
});

test('overview: bullets capped at 5', () => {
  const r = InsightRules.buildOverviewInsight({
    summary: { ytdRevenue: 100000, avgAOV: 30, avgConversionRate: 0.01, avgRepeatRate: 0.05 },
    goals: GOALS,
    ytdGoal: 100000,
    monthly: [
      { label: 'Jun', revenue: 20000, future: false, complete: true },
      { label: 'Jul', revenue: 10000, future: false, complete: true },
    ],
    topProducts: [{ name: 'Ruby Necklace', revenue: 40000 }],
    fyLabel: 'FY2026',
  });
  assert.ok(r.bullets.length <= 5);
});

// ── buildEmailInsight ────────────────────────────────────────

const EMAIL_GOALS = { campaignConversion: 0.0007, aov: 48, repeatPurchaseRate: 0.30, attribution: 0.30, listSize: 50000 };

test('email: attribution at/above goal gives good verdict', () => {
  const r = InsightRules.buildEmailInsight({
    summary: { attribution: 0.32, listSize: 50000, flowSharePct: 0.6, repeatPurchaseRate: 0.3, campaignAOV: 48, flowAOV: 48 },
    goals: EMAIL_GOALS,
  });
  assert.strictEqual(r.verdict.tone, 'good');
});

test('email: attribution well below goal gives bad verdict', () => {
  const r = InsightRules.buildEmailInsight({
    summary: { attribution: 0.15, listSize: 50000, flowSharePct: 0.6, repeatPurchaseRate: 0.3, campaignAOV: 48, flowAOV: 48 },
    goals: EMAIL_GOALS,
  });
  assert.strictEqual(r.verdict.tone, 'bad');
});

test('email: missing attribution data gives neutral "not enough data" verdict', () => {
  const r = InsightRules.buildEmailInsight({
    summary: { attribution: null, listSize: null, flowSharePct: null, repeatPurchaseRate: null, campaignAOV: null, flowAOV: null },
    goals: EMAIL_GOALS,
  });
  assert.strictEqual(r.verdict.tone, 'neutral');
  assert.match(r.verdict.text, /Not enough email\/SMS data/);
});

test('email: list size well below goal flags a watch bullet; null list size flags neutral tracked-status bullet', () => {
  const below = InsightRules.buildEmailInsight({
    summary: { attribution: 0.3, listSize: 20000, flowSharePct: 0.6, repeatPurchaseRate: 0.3, campaignAOV: 48, flowAOV: 48 },
    goals: EMAIL_GOALS,
  });
  assert.ok(below.bullets.some((b) => b.tone === 'watch' && /List size is/.test(b.text)));

  const missing = InsightRules.buildEmailInsight({
    summary: { attribution: 0.3, listSize: null, flowSharePct: 0.6, repeatPurchaseRate: 0.3, campaignAOV: 48, flowAOV: 48 },
    goals: EMAIL_GOALS,
  });
  assert.ok(missing.bullets.some((b) => /isn't tracked yet/.test(b.text)));
});

test('email: flow share below 50% flags watch (campaigns outperforming flows); above 70% flags good', () => {
  const low = InsightRules.buildEmailInsight({
    summary: { attribution: 0.3, listSize: 50000, flowSharePct: 0.3, repeatPurchaseRate: 0.3, campaignAOV: 48, flowAOV: 48 },
    goals: EMAIL_GOALS,
  });
  assert.ok(low.bullets.some((b) => b.tone === 'watch' && /Campaigns are outperforming flows/.test(b.text)));

  const high = InsightRules.buildEmailInsight({
    summary: { attribution: 0.3, listSize: 50000, flowSharePct: 0.8, repeatPurchaseRate: 0.3, campaignAOV: 48, flowAOV: 48 },
    goals: EMAIL_GOALS,
  });
  assert.ok(high.bullets.some((b) => b.tone === 'good' && /heavy lifting/.test(b.text)));
});

test('email: repeat purchase rate well below goal flags watch', () => {
  const r = InsightRules.buildEmailInsight({
    summary: { attribution: 0.3, listSize: 50000, flowSharePct: 0.6, repeatPurchaseRate: 0.15, campaignAOV: 48, flowAOV: 48 },
    goals: EMAIL_GOALS,
  });
  assert.ok(r.bullets.some((b) => b.tone === 'watch' && /Repeat purchase rate/.test(b.text)));
});

test('email: lower of campaign/flow AOV well below goal flags watch, names the weaker one', () => {
  const r = InsightRules.buildEmailInsight({
    summary: { attribution: 0.3, listSize: 50000, flowSharePct: 0.6, repeatPurchaseRate: 0.3, campaignAOV: 30, flowAOV: 50 },
    goals: EMAIL_GOALS,
  });
  const watch = r.bullets.find((b) => /AOV \(/.test(b.text));
  assert.ok(watch);
  assert.match(watch.text, /^Campaigns/);
});

test('email: bullets capped at 5', () => {
  const r = InsightRules.buildEmailInsight({
    summary: { attribution: 0.1, listSize: 5000, flowSharePct: 0.1, repeatPurchaseRate: 0.05, campaignAOV: 10, flowAOV: 12 },
    goals: EMAIL_GOALS,
  });
  assert.ok(r.bullets.length <= 5);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
