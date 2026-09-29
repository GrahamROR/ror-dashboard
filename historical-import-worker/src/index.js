import { enqueueRollingJobs, runNextJob } from './jobs.js';
import { writeArchives, writeMonthlySummary } from './archive.js';
import { isWholeMonth, SOURCES } from './lib.js';

const HOURLY = '7 * * * *';
const DAILY = '15 5 * * *';
const WEEKLY = '45 5 * * 0';

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleSchedule(controller.cron, env));
  },

  async fetch(request, env) {
    try {
      if (!(await authorised(request, env.ADMIN_TOKEN))) return Response.json({ error: 'unauthorised' }, { status: 401 });
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/status') return Response.json(await statusReport(env));
      if (request.method === 'POST' && url.pathname === '/jobs') return Response.json(await createJob(env, await optionalJson(request)), { status: 201 });
      const jobControl = url.pathname.match(/^\/jobs\/(\d+)\/(pause|resume)$/);
      if (request.method === 'POST' && jobControl) return Response.json(await controlJob(env, Number(jobControl[1]), jobControl[2]));
      if (request.method === 'POST' && url.pathname === '/run-next') return Response.json(await runNextJob(env));
      if (request.method === 'POST' && url.pathname === '/control/pause') return Response.json(await pause(env, await optionalJson(request)));
      if (request.method === 'POST' && url.pathname === '/control/resume') return Response.json(await resume(env, await optionalJson(request)));
      if (request.method === 'POST' && url.pathname === '/exports/regenerate') return Response.json(await regenerate(env, await optionalJson(request)));
      return Response.json({ error: 'not found' }, { status: 404 });
    } catch (error) {
      console.error(JSON.stringify({ event: 'request_failed', error: String(error?.message || error), at: new Date().toISOString() }));
      return Response.json({ error: String(error?.message || error) }, { status: 500 });
    }
  },
};

async function handleSchedule(cron, env) {
  if (cron === DAILY) await enqueueRollingJobs(env, 'daily_refresh', 7);
  if (cron === WEEKLY) await enqueueRollingJobs(env, 'weekly_catchup', 60);
  if (cron === HOURLY || cron === DAILY || cron === WEEKLY) return runNextJob(env);
  return { status: 'ignored', cron };
}

async function pause(env, body) {
  const target = body.target || 'historical';
  if (!['historical', 'updates', 'all'].includes(target)) throw new Error('target must be historical, updates or all');
  if (target === 'historical' || target === 'all') {
    await env.DB.prepare("UPDATE historical_import_control SET historical_paused = 1, updated_at = datetime('now') WHERE id = 1").run();
  }
  if (target === 'updates' || target === 'all') {
    await env.DB.prepare("UPDATE historical_import_control SET updates_paused = 1, updated_at = datetime('now') WHERE id = 1").run();
  }
  return { ok: true, target, paused: true };
}

async function resume(env, body) {
  const target = body.target || 'historical';
  if (!['historical', 'updates', 'all'].includes(target)) throw new Error('target must be historical, updates or all');
  if (target === 'historical' || target === 'all') {
    const year = Number(body.year || 2023);
    if (!Number.isInteger(year) || year < 2017 || year > 2023) throw new Error('historical year must be 2017..2023');
    await env.DB.batch([
      env.DB.prepare("UPDATE historical_import_jobs SET status = 'pending', updated_at = datetime('now') WHERE job_kind = 'historical' AND wave_year = ? AND status = 'paused'").bind(year),
      env.DB.prepare("UPDATE historical_import_control SET historical_paused = 0, updated_at = datetime('now') WHERE id = 1"),
    ]);
  }
  if (target === 'updates' || target === 'all') {
    await env.DB.prepare("UPDATE historical_import_control SET updates_paused = 0, updated_at = datetime('now') WHERE id = 1").run();
  }
  return { ok: true, target, year: body.year || 2023, paused: false };
}

async function regenerate(env, body) {
  if (!SOURCES.includes(body.source) || !/^\d{4}-\d{2}$/.test(body.month || '')) throw new Error('source and month=YYYY-MM are required');
  const [year, month] = body.month.split('-').map(Number);
  const from = `${body.month}-01`;
  const to = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const archive = await writeArchives(env, { id: `regenerate-${Date.now()}`, import_run_id: null, source: body.source, date_from: from, date_to: to });
  return { ok: true, source: body.source, month: body.month, archive };
}

async function createJob(env, body) {
  if (!SOURCES.includes(body.source)) throw new Error('source must be shopify, etsy or noths');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date_from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(body.date_to || '')) {
    throw new Error('date_from and date_to must be YYYY-MM-DD');
  }
  if (body.date_from >= body.date_to) throw new Error('date_from must be before date_to; date_to is exclusive');
  if (!isWholeMonth(body.date_from, body.date_to)) {
    throw new Error('historical jobs must currently cover one full calendar month');
  }
  const status = body.status === 'paused' ? 'paused' : 'pending';
  const result = await env.DB.prepare(
    `INSERT INTO historical_import_jobs
       (source, date_from, date_to, status, job_kind, wave_year, priority)
     VALUES (?, ?, ?, ?, 'historical', ?, ?)`
  ).bind(body.source, body.date_from, body.date_to, status, Number(body.date_from.slice(0, 4)), Number(body.priority || 300)).run();
  return { ok: true, id: Number(result.meta.last_row_id), source: body.source, date_from: body.date_from, date_to: body.date_to, status };
}

async function controlJob(env, id, action) {
  const nextStatus = action === 'pause' ? 'paused' : 'pending';
  const allowed = action === 'pause' ? "('pending', 'failed')" : "('paused', 'failed')";
  const result = await env.DB.prepare(
    `UPDATE historical_import_jobs
     SET status = ?, next_attempt_at = NULL, updated_at = datetime('now')
     WHERE id = ? AND status IN ${allowed}`
  ).bind(nextStatus, id).run();
  if (!result.meta.changes) throw new Error(`job ${id} was not in a state that can be ${action}d`);
  return { ok: true, id, status: nextStatus };
}

async function statusReport(env) {
  const [control, counts, jobs, monthly, coverage, duplicates, failed] = await Promise.all([
    env.DB.prepare('SELECT * FROM historical_import_control WHERE id = 1').first(),
    env.DB.prepare('SELECT status, source, COUNT(*) AS jobs FROM historical_import_jobs GROUP BY status, source ORDER BY status, source').all(),
    env.DB.prepare(
      `SELECT id, source, date_from, date_to, status, job_kind, wave_year,
              rows_fetched, orders_fetched, units_fetched, revenue_total,
              retry_count, max_retries, error_message, started_at, completed_at, updated_at
       FROM historical_import_jobs
       ORDER BY CASE status WHEN 'running' THEN 1 WHEN 'failed' THEN 2 WHEN 'pending' THEN 3 WHEN 'completed' THEN 4 ELSE 5 END,
                updated_at DESC, id DESC
       LIMIT 250`
    ).all(),
    env.DB.prepare(
      `SELECT substr(placed_at, 1, 7) AS year_month, source,
              COUNT(*) AS rows, COUNT(DISTINCT external_order_id) AS orders,
              SUM(quantity) AS units, ROUND(SUM(COALESCE(gross_revenue, 0)), 2) AS revenue
       FROM sales_history_items
       WHERE source IN ('shopify', 'etsy', 'noths')
       GROUP BY substr(placed_at, 1, 7), source
       ORDER BY year_month, source`
    ).all(),
    env.DB.prepare("SELECT MIN(substr(placed_at,1,10)) AS earliest, MAX(substr(placed_at,1,10)) AS latest, COUNT(*) AS rows, SUM(quantity) AS units, ROUND(SUM(gross_revenue),2) AS revenue FROM sales_history_items WHERE source IN ('shopify','etsy','noths')").first(),
    env.DB.prepare("SELECT COUNT(*) AS duplicate_key_groups FROM (SELECT 1 FROM sales_history_items GROUP BY source, external_order_id, external_line_id HAVING COUNT(*) > 1)").first(),
    env.DB.prepare("SELECT id, source, date_from, date_to, retry_count, max_retries, error_message, next_attempt_at, updated_at FROM historical_import_jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 50").all(),
  ]);
  return { control, job_counts: counts.results, jobs: jobs.results, monthly_audit: monthly.results, coverage, duplicate_key_groups: Number(duplicates?.duplicate_key_groups || 0), failed_jobs: failed.results };
}

async function authorised(request, expected) {
  if (!expected) return false;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function optionalJson(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

export { handleSchedule, statusReport, writeMonthlySummary };
