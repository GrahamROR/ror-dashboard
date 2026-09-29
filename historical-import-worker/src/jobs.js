import { isWholeMonth, rangesOverlappingDays, retryDelaySeconds, safeError, SOURCES } from './lib.js';
import { writeArchives } from './archive.js';

export async function enqueueRollingJobs(env, jobKind, days, now = new Date()) {
  const priority = jobKind === 'daily_refresh' ? 1000 : 900;
  let inserted = 0;
  for (const range of rangesOverlappingDays(now, days)) {
    for (const source of SOURCES) {
      const existing = await env.DB.prepare(
        `SELECT id FROM historical_import_jobs
         WHERE source = ? AND date_from = ? AND date_to = ? AND job_kind = ?
           AND (status IN ('pending', 'running') OR (status = 'failed' AND retry_count < max_retries))
         LIMIT 1`
      ).bind(source, range.from, range.to, jobKind).first();
      if (existing) continue;
      const result = await env.DB.prepare(
        `INSERT INTO historical_import_jobs
          (source, date_from, date_to, status, job_kind, wave_year, priority)
         VALUES (?, ?, ?, 'pending', ?, ?, ?)`
      ).bind(source, range.from, range.to, jobKind, Number(range.from.slice(0, 4)), priority).run();
      inserted += Number(result.meta.changes || 0);
    }
  }
  return inserted;
}

export async function runNextJob(env) {
  // A Worker can be terminated after claiming a job. Expired leases are made
  // retryable before choosing the next job, so no month is stranded forever.
  await env.DB.prepare(
    `UPDATE historical_import_jobs
     SET status = 'failed', error_message = 'Worker lease expired before completion',
         retry_count = retry_count + 1, next_attempt_at = datetime('now'),
         lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now')
     WHERE status = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= datetime('now')`
  ).run();

  const control = await env.DB.prepare(
    'SELECT historical_paused, updates_paused FROM historical_import_control WHERE id = 1'
  ).first();
  const clauses = [];
  if (!control?.historical_paused) clauses.push("job_kind = 'historical'");
  if (!control?.updates_paused) clauses.push("job_kind IN ('daily_refresh', 'weekly_catchup')");
  if (!clauses.length) return { status: 'paused' };

  const job = await env.DB.prepare(
    `SELECT * FROM historical_import_jobs
     WHERE (${clauses.join(' OR ')})
       AND (status = 'pending' OR (status = 'failed' AND retry_count < max_retries))
       AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now'))
     ORDER BY priority DESC, date_from ASC,
              CASE source WHEN 'shopify' THEN 1 WHEN 'etsy' THEN 2 ELSE 3 END,
              id ASC
     LIMIT 1`
  ).first();
  if (!job) return { status: 'idle' };

  const leaseToken = crypto.randomUUID();
  const claim = await env.DB.prepare(
    `UPDATE historical_import_jobs
     SET status = 'running', started_at = datetime('now'), completed_at = NULL,
         lease_token = ?, lease_expires_at = datetime('now', '+45 minutes'), updated_at = datetime('now')
     WHERE id = ? AND status IN ('pending', 'failed')`
  ).bind(leaseToken, job.id).run();
  if (!claim.meta.changes) return { status: 'contended', job_id: job.id };

  try {
    const importResult = await callImporter(env, job);
    const totals = await rangeTotals(env.DB, job);
    const archive = await writeArchives(env, { ...job, import_run_id: importResult.run_id ?? null });
    await env.DB.prepare(
      `UPDATE historical_import_jobs
       SET status = 'completed', completed_at = datetime('now'),
           rows_fetched = ?, orders_fetched = ?, units_fetched = ?, revenue_total = ?,
           error_message = NULL, import_run_id = ?, raw_archive_key = ?, normalised_archive_key = ?,
           lease_token = NULL, lease_expires_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND lease_token = ?`
    ).bind(
      Number(importResult.rows_fetched || 0), totals.orders, totals.units, totals.revenue,
      importResult.run_id ?? null, archive.rawKey, archive.normalisedKey, job.id, leaseToken
    ).run();
    log('job_completed', { job_id: job.id, source: job.source, date_from: job.date_from, date_to: job.date_to, ...totals });
    return { status: 'completed', job_id: job.id, source: job.source, ...totals, archive };
  } catch (error) {
    const retryCount = Number(job.retry_count || 0) + 1;
    const delay = retryDelaySeconds(retryCount - 1);
    await env.DB.prepare(
      `UPDATE historical_import_jobs
       SET status = 'failed', completed_at = datetime('now'), error_message = ?, retry_count = ?,
           next_attempt_at = datetime('now', ?), lease_token = NULL, lease_expires_at = NULL,
           updated_at = datetime('now')
       WHERE id = ? AND lease_token = ?`
    ).bind(safeError(error), retryCount, `+${delay} seconds`, job.id, leaseToken).run();
    log('job_failed', { job_id: job.id, source: job.source, retry_count: retryCount, retry_in_seconds: delay, error: safeError(error) }, true);
    return { status: 'failed', job_id: job.id, error: safeError(error), retry_count: retryCount };
  }
}

async function callImporter(env, job) {
  if (!env.STOCKHUB) {
    throw new Error('The private StockHub service binding is required');
  }

  // StockHub already owns the Shopify, Etsy and NOTHS credentials and its
  // established importer. Calling it through a service binding keeps those
  // secrets in one Worker and bypasses the public Cloudflare Access boundary.
  if (!isWholeMonth(job.date_from, job.date_to)) {
    throw new Error('The StockHub importer currently accepts full calendar months only');
  }
  const [year, month] = job.date_from.split('-').map(Number);
  const response = await env.STOCKHUB.fetch(new Request('https://stockhub.internal/api/sales-history/pull-month', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: job.source, year, month }),
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(`Importer failed (${response.status}): ${payload.error || 'unknown response'}`);
  return payload;
}

export { callImporter };

async function rangeTotals(db, job) {
  const row = await db.prepare(
    `SELECT COUNT(*) AS rows, COUNT(DISTINCT external_order_id) AS orders,
            COALESCE(SUM(quantity), 0) AS units,
            ROUND(COALESCE(SUM(gross_revenue), 0), 2) AS revenue
     FROM sales_history_items
     WHERE source = ? AND placed_at >= ? AND placed_at < ?`
  ).bind(job.source, `${job.date_from}T00:00:00.000Z`, `${job.date_to}T00:00:00.000Z`).first();
  return { rows: Number(row?.rows || 0), orders: Number(row?.orders || 0), units: Number(row?.units || 0), revenue: Number(row?.revenue || 0) };
}

function log(event, fields, error = false) {
  const line = JSON.stringify({ event, ...fields, at: new Date().toISOString() });
  if (error) console.error(line); else console.log(line);
}
