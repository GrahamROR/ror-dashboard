// ============================================================
// ROR SALES DASHBOARD 2 — demo/fixture data generator
// ------------------------------------------------------------
// Produces dashboard2/demo-data.json: a procedurally generated,
// entirely FICTIONAL set of monthly sales records across Shopify,
// NOTHS and Etsy (plus two closed legacy channels, SilkFred and
// ASOS, for testing the "historical closed channel" handling).
//
// This is deliberately NOT a transcription of the real workbook —
// the repo is public, so no real Rock On Ruby revenue figures may
// be committed here. The shape (channels, monthly grain, a couple
// of discontinued marketplaces) mirrors the real workbook's
// structure; the numbers themselves are synthetic.
//
// Deterministic (seeded RNG) so re-running produces the same file —
// makes diffs meaningful if the generator itself is later tweaked.
//
// Usage: node scripts/build-demo-data.js
// ============================================================

const fs = require('fs');
const path = require('path');

// ── seeded RNG (mulberry32) — deterministic across runs ───────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260924);
const jitter = (spread) => 1 + (rng() * 2 - 1) * spread;

// Calendar-month seasonality (index 0 = Jan .. 11 = Dec). Personalised
// gifts business — big Nov/Dec (Christmas) peak, secondary bump around
// Mother's/Father's Day (Mar/Jun), quiet Jan/Feb/Aug.
const SEASONALITY = [0.75, 0.70, 0.95, 0.85, 0.90, 1.00, 0.80, 0.70, 0.85, 0.95, 1.55, 1.85];
const seasonalityFor = (calMonth) => SEASONALITY[calMonth - 1];

function monthKey(y, m) { return `${y}-${String(m).padStart(2, '0')}`; }

function* monthRange(startKey, endKey) {
  let [y, m] = startKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    yield monthKey(y, m);
    m++; if (m > 12) { m = 1; y++; }
  }
}

const TODAY = new Date();
const CURRENT_PERIOD = monthKey(TODAY.getFullYear(), TODAY.getMonth() + 1);

// ── active channel definitions ─────────────────────────────────
// baseMonthly = an approximate steady-state monthly revenue before
// seasonality/growth/noise; growthPerYear = compounding YoY uplift;
// aov = rough average order value used to derive an order count.
const ACTIVE = {
  shopify: { start: '2021-08', baseMonthly: 19000, growthPerYear: 0.10, aov: 29, aovJitter: 0.06 },
  noths:   { start: '2021-08', baseMonthly: 3200,  growthPerYear: 0.06, aov: 34, aovJitter: 0.08 },
  etsy:    { start: '2021-08', baseMonthly: 1600,  growthPerYear: 0.14, aov: 22, aovJitter: 0.10 },
};

// ── legacy (closed) channels — historical only, discontinued ──
const LEGACY = {
  silkfred: { start: '2016-01', end: '2018-12', baseMonthly: 900,  growthPerYear: 0.02, aov: 45, aovJitter: 0.12 },
  asos:     { start: '2017-06', end: '2019-12', baseMonthly: 1400, growthPerYear: 0.00, aov: 27, aovJitter: 0.12 },
};

function yearsBetween(startKey, periodKey) {
  const [sy, sm] = startKey.split('-').map(Number);
  const [py, pm] = periodKey.split('-').map(Number);
  return (py - sy) + (pm - sm) / 12;
}

function buildChannelRecords(channel, cfg, hardEndKey) {
  const records = [];
  const endKey = hardEndKey || CURRENT_PERIOD;
  for (const period of monthRange(cfg.start, endKey)) {
    const [, m] = period.split('-').map(Number);
    const growth = Math.pow(1 + cfg.growthPerYear, yearsBetween(cfg.start, period));
    const revenue = Math.round(
      cfg.baseMonthly * seasonalityFor(m) * growth * jitter(0.07) * 100
    ) / 100;
    const aov = Math.round(cfg.aov * jitter(cfg.aovJitter) * 100) / 100;
    const orders = Math.max(1, Math.round(revenue / aov));
    const completeness = period === CURRENT_PERIOD ? 'partial' : 'complete';
    records.push({
      period, channel,
      revenue, orders,
      currency: 'GBP',
      source: 'demo-fixture',
      completeness,
    });
  }
  return records;
}

const records = [];
for (const [channel, cfg] of Object.entries(ACTIVE)) {
  records.push(...buildChannelRecords(channel, cfg));
}
for (const [channel, cfg] of Object.entries(LEGACY)) {
  records.push(...buildChannelRecords(channel, cfg, cfg.end));
}
records.sort((a, b) => a.period === b.period ? a.channel.localeCompare(b.channel) : a.period.localeCompare(b.period));

const out = {
  meta: {
    label: 'DEMO DATA — fictional figures generated for interface development and testing only. These are NOT Rock On Ruby\'s real sales.',
    generator: 'scripts/build-demo-data.js',
    generatedAt: new Date().toISOString(),
    grain: 'monthly',
    currency: 'GBP',
    channels: {
      active: Object.keys(ACTIVE),
      legacy: Object.keys(LEGACY),
    },
  },
  records,
};

const outPath = path.join(__dirname, '..', 'dashboard2', 'demo-data.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${records.length} records to ${outPath}`);
