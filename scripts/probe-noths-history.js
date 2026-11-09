// ============================================================
// ONE-OFF, READ-ONLY DIAGNOSTIC — not part of the production pipeline.
// Answers one question: how far back can the NOTHS orders API actually
// be read, and does it honour any date-filtering query parameter?
// Makes a handful of GET requests only. Never writes, never publishes,
// never logs customer data, order IDs or raw payload bodies — only
// counts and dates needed to judge feasibility of a historical backfill.
// Safe to delete after use.
// ============================================================
'use strict';

const BASE = 'https://api.notonthehighstreet.com/api/v1/orders';

async function call(token, extraParams, label) {
  const u = new URL(BASE);
  const params = { token, per_page: 1, offset: 0, sort: 'placed_at', include: 'financials', ...extraParams };
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const safeUrl = u.toString().replace(token, 'REDACTED');
  let r;
  try {
    r = await fetch(u, { method: 'GET', signal: AbortSignal.timeout(30000) });
  } catch (e) {
    console.log(`[${label}] request failed: ${e.message} (${safeUrl})`);
    return;
  }
  if (!r.ok) {
    console.log(`[${label}] HTTP ${r.status} (${safeUrl})`);
    return;
  }
  const body = await r.json();
  const order = Array.isArray(body.data) ? body.data[0] : null;
  console.log(
    `[${label}] total=${body.query?.total ?? 'unknown'} firstOrderPlacedAt=${order?.placed_at ?? 'none'} params=${JSON.stringify(extraParams)}`
  );
}

async function main() {
  const token = process.env.NOTHS_TOKEN;
  if (!token) throw new Error('NOTHS_TOKEN not set');

  // 1. Baseline — newest-first, no date filter (what production uses today).
  await call(token, { dir: 'desc' }, 'baseline-desc');

  // 2. Oldest-first, no date filter — if honoured, order[0] is the earliest
  //    order the API will ever serve, answering the depth question directly.
  await call(token, { dir: 'asc' }, 'oldest-first-asc');

  // 3-6. Try a handful of plausible date-filter parameter names with an
  //    obviously-old cutoff, oldest-first, and compare the reported total
  //    against the unfiltered total above. If a param is honoured, the
  //    "total" should shrink or the first order's date should move.
  const candidates = [
    { since: '2015-01-01' },
    { placed_after: '2015-01-01' },
    { created_after: '2015-01-01T00:00:00Z' },
    { from: '2015-01-01' },
    { start_date: '2015-01-01' },
    { min_placed_at: '2015-01-01T00:00:00Z' },
  ];
  for (const extra of candidates) {
    await call(token, { dir: 'asc', ...extra }, 'filter:' + Object.keys(extra)[0]);
  }
}

main().catch((e) => {
  console.error('Probe failed:', e.message);
  process.exitCode = 1;
});
