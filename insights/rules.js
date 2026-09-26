// ============================================================
// ANALYSIS ENGINE — rules-based, no LLM/API call
// ------------------------------------------------------------
// Deterministic, explainable "what's good/bad and why" narratives
// for the Overview, Email and Ads tabs. Every bullet traces back to
// a real computed number already on the page — this never invents
// a cause it can't see (no comments on specific creative/keywords/
// audiences it has no data on) and never fires a rule on a missing
// or insufficient sample.
//
// Pure functions only — see insights/test/rules.test.js.
// ============================================================

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.InsightRules = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {

function pctText(v) { return v == null ? 'n/a' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
function money(v, d) { return v == null ? 'n/a' : '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 0 }); }
function num(v) { return v == null ? 'n/a' : Math.round(v).toLocaleString('en-GB'); }
function pctOf(v, d) { return v == null ? 'n/a' : (v * 100).toFixed(d ?? 1) + '%'; }
function roasText(v) { return v == null ? 'n/a' : v.toFixed(2) + 'x'; }

function bullet(tone, text, score) { return { tone, text, score: score ?? 0 }; }

function topBullets(candidates, max) {
  return candidates
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, max ?? 6)
    .map(({ tone, text }) => ({ tone, text }));
}

// ── PAID ADS ─────────────────────────────────────────────────
// ctx: { rangeLabel, comparisonLabel, current, comparisons, meta, google,
//        metaComparisons, googleComparisons, shopify: {orders, sessions, convRate} }
const MIN_CHANNEL_SPEND = 50; // below this, ROAS/CPA gaps are noise, not signal
const CHANNEL_GAP_THRESHOLD_PCT = 40;

function buildAdsInsight(ctx) {
  const { current, comparisons, meta, google, metaComparisons, googleComparisons, shopify } = ctx;

  if (!current || current.status === 'not-occurred') {
    return { verdict: bullet('neutral', 'This period hasn\'t happened yet.'), bullets: [] };
  }
  if (current.status === 'no-data') {
    return { verdict: bullet('neutral', 'No ad data recorded for this period.'), bullets: [] };
  }

  // ── verdict — driven by the ROAS trend when available ───────
  let verdict;
  const cmpRoas = comparisons && comparisons.roas;
  if (!cmpRoas || (cmpRoas.status !== 'ok' && cmpRoas.status !== 'incomplete-current')) {
    verdict = bullet('neutral', `This period: ${roasText(current.roas)} ROAS on ${money(current.spend)} spend, ${num(current.conversions)} conversions — no comparison period to judge a trend against.`);
  } else {
    const d = cmpRoas.percentChange;
    if (d == null) {
      verdict = bullet('neutral', `ROAS is ${roasText(current.roas)} — the comparison period had no spend, so no meaningful trend to report.`);
    } else if (d >= 10) {
      verdict = bullet('good', `Efficiency improved — ROAS up ${pctText(d)} vs ${ctx.comparisonLabel || 'the comparison period'} (${roasText(cmpRoas.previous)} → ${roasText(current.roas)}).`);
    } else if (d <= -10) {
      verdict = bullet('bad', `Efficiency declined — ROAS down ${pctText(d)} vs ${ctx.comparisonLabel || 'the comparison period'} (${roasText(cmpRoas.previous)} → ${roasText(current.roas)}).`);
    } else {
      verdict = bullet('neutral', `Roughly steady — ROAS moved ${pctText(d)} vs ${ctx.comparisonLabel || 'the comparison period'}.`);
    }
  }

  const candidates = [];

  // ── spend vs conversions divergence ─────────────────────────
  if (comparisons && comparisons.spend?.status === 'ok' && comparisons.conversions?.status === 'ok') {
    const spendPct = comparisons.spend.percentChange;
    const convPct = comparisons.conversions.percentChange;
    if (spendPct != null && convPct != null) {
      if (spendPct >= 15 && convPct < spendPct / 2) {
        let who = '';
        if (metaComparisons?.spend?.status === 'ok' && googleComparisons?.spend?.status === 'ok') {
          who = (metaComparisons.spend.percentChange ?? 0) >= (googleComparisons.spend.percentChange ?? 0) ? ' — mostly on Meta' : ' — mostly on Google';
        }
        candidates.push(bullet('bad', `Spend is up ${pctText(spendPct)}${who} but conversions only moved ${pctText(convPct)} — the extra budget isn't translating into proportionally more results yet.`, Math.abs(spendPct - convPct)));
      } else if (spendPct <= -10 && convPct > -5) {
        candidates.push(bullet('good', `Spend is down ${pctText(spendPct)} while conversions held (${pctText(convPct)}) — genuinely more efficient, not just cheaper.`, Math.abs(spendPct - convPct)));
      }
    }
  }

  // ── channel efficiency gap (this period) ────────────────────
  if (meta && google && meta.spend >= MIN_CHANNEL_SPEND && google.spend >= MIN_CHANNEL_SPEND && meta.roas != null && google.roas != null) {
    const higherIsMeta = meta.roas >= google.roas;
    const higherVal = higherIsMeta ? meta.roas : google.roas;
    const lowerVal = higherIsMeta ? google.roas : meta.roas;
    const higherName = higherIsMeta ? 'Meta' : 'Google';
    const lowerName = higherIsMeta ? 'Google' : 'Meta';
    if (lowerVal > 0) {
      const gapPct = ((higherVal / lowerVal) - 1) * 100;
      if (gapPct >= CHANNEL_GAP_THRESHOLD_PCT) {
        candidates.push(bullet('watch', `${higherName} is converting far more efficiently than ${lowerName} right now (${roasText(higherVal)} vs ${roasText(lowerVal)} ROAS) — worth shifting some budget toward ${higherName}, or checking ${lowerName} for creative fatigue, audience saturation, or rising competition on that channel.`, gapPct));
      }
    }
  }

  // ── per-channel CPA drift ────────────────────────────────────
  [['Meta', metaComparisons], ['Google', googleComparisons]].forEach(([name, cmp]) => {
    if (cmp?.cpa?.status === 'ok' && cmp.cpa.percentChange != null) {
      const d = cmp.cpa.percentChange;
      if (d >= 25) candidates.push(bullet('bad', `${name}'s cost per conversion rose ${pctText(d)} (${money(cmp.cpa.previous, 2)} → ${money(cmp.cpa.current, 2)}) — a sign of creative fatigue, audience saturation, or more competitive bidding on that channel.`, Math.abs(d)));
      else if (d <= -20) candidates.push(bullet('good', `${name}'s cost per conversion fell ${pctText(d)} (${money(cmp.cpa.previous, 2)} → ${money(cmp.cpa.current, 2)}) — cheaper conversions there right now.`, Math.abs(d)));
    }
  });

  // ── attribution sanity check vs real Shopify orders ─────────
  if (shopify && shopify.orders != null && shopify.orders > 0 && current.conversions != null) {
    const ratio = current.conversions / shopify.orders;
    if (ratio >= 1) {
      candidates.push(bullet('bad', `Meta + Google are claiming ${num(current.conversions)} conversions — more than the ${num(shopify.orders)} total Shopify orders recorded for the overlapping months. That's over-counted attribution (platforms double-crediting the same sale), not a real sales signal — judge performance by actual Shopify revenue, not platform conversions, until this settles.`, 1000));
    } else if (ratio <= 0.85) {
      candidates.push(bullet('good', `Platform-reported conversions (${num(current.conversions)}) are a plausible ${pctOf(ratio, 0)} share of total Shopify orders (${num(shopify.orders)}) — attribution looks reasonably trustworthy this period.`, 50));
    } else {
      candidates.push(bullet('watch', `Platform conversions are ${pctOf(ratio, 0)} of total Shopify orders — on the high side. Worth watching whether this creeps toward or past 100% (a sign of over-attribution).`, 200));
    }
  }

  return { verdict, bullets: topBullets(candidates, 6) };
}

// ── SHOPIFY GROWTH OVERVIEW ──────────────────────────────────
// ctx: { summary, goals, ytdGoal, monthly, topProducts, fyLabel }
function buildOverviewInsight(ctx) {
  const { summary, goals, ytdGoal, monthly, topProducts, fyLabel } = ctx;
  const candidates = [];

  const revPct = ytdGoal ? ((summary.ytdRevenue || 0) / ytdGoal - 1) * 100 : null;
  let verdict;
  if (revPct == null) {
    verdict = bullet('neutral', `YTD revenue is ${money(summary.ytdRevenue)} for ${fyLabel || 'this year'} — no goal pace to compare against yet.`);
  } else if (revPct >= 5) {
    verdict = bullet('good', `Ahead of the YTD revenue goal by ${pctText(revPct)} (${money(summary.ytdRevenue)} vs ${money(ytdGoal)} pace).`);
  } else if (revPct <= -5) {
    verdict = bullet('bad', `Behind the YTD revenue goal by ${pctText(Math.abs(revPct) * -1)} (${money(ytdGoal - (summary.ytdRevenue || 0))} short of pace).`);
  } else {
    verdict = bullet('neutral', `On track — within 5% of the YTD revenue goal pace.`);
  }

  if (summary.avgAOV != null && goals.aov) {
    const d = (summary.avgAOV / goals.aov - 1) * 100;
    if (d <= -15) candidates.push(bullet('bad', `AOV is ${money(summary.avgAOV, 2)}, ${pctText(d)} below the ${money(goals.aov)} goal — bundles, free-shipping thresholds, or upsells at checkout would help close this.`, Math.abs(d)));
    else if (d >= 0) candidates.push(bullet('good', `AOV is ${money(summary.avgAOV, 2)}, at or above the ${money(goals.aov)} goal.`, Math.abs(d)));
  }

  if (summary.avgConversionRate != null && goals.conversion) {
    const d = (summary.avgConversionRate / goals.conversion - 1) * 100;
    if (d <= -20) candidates.push(bullet('bad', `Conversion rate is ${pctOf(summary.avgConversionRate, 2)}, well below the ${pctOf(goals.conversion, 1)} goal — check site speed, checkout friction, and whether traffic quality has shifted.`, Math.abs(d)));
    else if (d >= 0) candidates.push(bullet('good', `Conversion rate is ${pctOf(summary.avgConversionRate, 2)}, at or above the ${pctOf(goals.conversion, 1)} goal.`, Math.abs(d)));
  }

  if (summary.avgRepeatRate != null && goals.repeatRate) {
    const d = (summary.avgRepeatRate / goals.repeatRate - 1) * 100;
    if (d <= -20) candidates.push(bullet('watch', `Repeat purchase rate is ${pctOf(summary.avgRepeatRate, 1)} vs the ${pctOf(goals.repeatRate, 0)} goal — email/SMS flows and a loyalty incentive are the usual levers here.`, Math.abs(d)));
  }

  const completed = (monthly || []).filter((m) => !m.future && m.complete !== false);
  if (completed.length >= 2) {
    const last = completed[completed.length - 1];
    const prev = completed[completed.length - 2];
    if (last.revenue != null && prev.revenue && prev.revenue > 0) {
      const d = (last.revenue / prev.revenue - 1) * 100;
      if (d <= -15) candidates.push(bullet('watch', `Revenue dropped ${pctText(d)} month-on-month (${prev.label} → ${last.label}) — worth checking if that's seasonal or a real slowdown.`, Math.abs(d)));
      else if (d >= 15) candidates.push(bullet('good', `Revenue grew ${pctText(d)} month-on-month (${prev.label} → ${last.label}).`, Math.abs(d)));
    }
  }

  if (topProducts && topProducts.length && summary.ytdRevenue) {
    const top = topProducts[0];
    const share = top.revenue / summary.ytdRevenue;
    if (share >= 0.25) {
      candidates.push(bullet('watch', `"${top.name}" is ${pctOf(share, 0)} of YTD revenue — a concentration risk if demand for it shifts. Worth spreading marketing across more of the catalogue.`, share * 100));
    }
  }

  return { verdict, bullets: topBullets(candidates, 5) };
}

// ── EMAIL / SMS ──────────────────────────────────────────────
// ctx: { summary (es), goals (EMAIL_GOALS_CLIENT) }
function buildEmailInsight(ctx) {
  const { summary: es, goals } = ctx;
  const candidates = [];

  let verdict;
  if (es.attribution != null && goals.attribution) {
    const d = (es.attribution / goals.attribution - 1) * 100;
    if (d >= 0) verdict = bullet('good', `Email/SMS is driving ${pctOf(es.attribution, 1)} of store revenue — at or above the ${pctOf(goals.attribution, 0)} goal.`);
    else if (d <= -30) verdict = bullet('bad', `Email/SMS attribution is ${pctOf(es.attribution, 1)}, well below the ${pctOf(goals.attribution, 0)} goal.`);
    else verdict = bullet('neutral', `Email/SMS attribution is ${pctOf(es.attribution, 1)} vs the ${pctOf(goals.attribution, 0)} goal.`);
  } else {
    verdict = bullet('neutral', 'Not enough email/SMS data yet to judge attribution.');
  }

  if (es.listSize != null && goals.listSize) {
    const d = (es.listSize / goals.listSize - 1) * 100;
    if (d <= -30) candidates.push(bullet('watch', `List size is ${num(es.listSize)}, ${pctText(d)} vs the ${num(goals.listSize)} goal — list growth (pop-ups, giveaways, in-package cards) compounds every other email metric.`, Math.abs(d)));
  } else if (es.listSize == null) {
    candidates.push(bullet('neutral', 'List size isn\'t tracked yet.', 1));
  }

  if (es.flowSharePct != null) {
    if (es.flowSharePct < 0.5) {
      candidates.push(bullet('watch', `Campaigns are outperforming flows in revenue share (only ${pctOf(es.flowSharePct, 0)} from flows) — check that welcome, abandonment and post-purchase flows are fully built out, since they compound with far less manual effort than one-off campaigns.`, (0.5 - es.flowSharePct) * 100));
    } else if (es.flowSharePct >= 0.7) {
      candidates.push(bullet('good', `Flows are doing the heavy lifting (${pctOf(es.flowSharePct, 0)} of email revenue) — a healthy sign of automation, not just manual sends.`, es.flowSharePct * 50));
    }
  }

  if (es.repeatPurchaseRate != null && goals.repeatPurchaseRate) {
    const d = (es.repeatPurchaseRate / goals.repeatPurchaseRate - 1) * 100;
    if (d <= -25) candidates.push(bullet('watch', `Repeat purchase rate is ${pctOf(es.repeatPurchaseRate, 1)} vs the ${pctOf(goals.repeatPurchaseRate, 0)} goal — a post-purchase or win-back flow is the usual lever.`, Math.abs(d)));
  }

  if (es.campaignAOV != null && es.flowAOV != null && goals.aov) {
    const lower = Math.min(es.campaignAOV, es.flowAOV);
    const which = es.campaignAOV <= es.flowAOV ? 'Campaigns' : 'Flows';
    if (lower < goals.aov * 0.75) {
      candidates.push(bullet('watch', `${which}' AOV (${money(lower, 2)}) is notably below the ${money(goals.aov)} goal — consider merchandising higher-value products or a spend threshold for a perk in those sends.`, (goals.aov - lower)));
    }
  }

  return { verdict, bullets: topBullets(candidates, 5) };
}

return { buildAdsInsight, buildOverviewInsight, buildEmailInsight, pctText, money, num, pctOf, roasText };

});
