import { toCsv } from './lib.js';

const NORMALISED_COLUMNS = [
  'source', 'external_order_id', 'external_line_id', 'order_date', 'date',
  'product_title', 'variant_title', 'quantity', 'gross_revenue', 'discounts',
  'refunds', 'shipping', 'tax', 'net_revenue', 'currency', 'import_batch_id',
  'revenue_basis', 'created_at', 'updated_at',
];

async function pagedItems(db, whereSql, bindings) {
  const rows = [];
  let lastId = 0;
  for (;;) {
    const result = await db.prepare(
      `SELECT i.id, i.source, i.external_order_id, i.external_line_id, i.placed_at,
              i.listing_title, i.variant_title, i.quantity, i.gross_revenue,
              i.net_revenue, o.currency, i.raw_json, i.imported_at, i.updated_at
       FROM sales_history_items i
       JOIN sales_history_orders o
         ON o.source = i.source AND o.external_order_id = i.external_order_id
       WHERE ${whereSql} AND i.id > ?
       ORDER BY i.id LIMIT 1000`
    ).bind(...bindings, lastId).all();
    rows.push(...result.results);
    if (result.results.length < 1000) break;
    lastId = Number(result.results[result.results.length - 1].id);
  }
  return rows;
}

function normaliseRows(rows, importBatchId) {
  return rows.map((row) => {
    const gross = row.gross_revenue === null ? null : Number(row.gross_revenue);
    const net = row.net_revenue === null ? null : Number(row.net_revenue);
    const raw = parseRaw(row.raw_json);
    const financial = raw && typeof raw === 'object' ? raw._ror_financial : null;
    return {
      source: row.source,
      external_order_id: row.external_order_id,
      external_line_id: row.external_line_id,
      order_date: String(row.placed_at).slice(0, 10),
      date: String(row.placed_at).slice(0, 10),
      product_title: row.listing_title,
      variant_title: row.variant_title,
      quantity: Number(row.quantity),
      gross_revenue: gross,
      discounts: financial?.discounts ?? (gross !== null && net !== null ? Math.max(0, gross - net) : null),
      refunds: financial?.refunds ?? null,
      shipping: financial?.shipping ?? null,
      tax: financial?.tax ?? null,
      net_revenue: net,
      currency: row.currency || 'GBP',
      import_batch_id: importBatchId,
      revenue_basis: 'gross_line_revenue',
      created_at: row.imported_at,
      updated_at: row.updated_at,
    };
  });
}

export async function writeArchives(env, job) {
  const yearMonth = job.date_from.slice(0, 7);
  const year = job.date_from.slice(0, 4);
  const monthRows = await pagedItems(
    env.DB,
    'i.source = ? AND i.placed_at >= ? AND i.placed_at < ?',
    [job.source, `${yearMonth}-01T00:00:00.000Z`, nextMonthIso(yearMonth)]
  );

  const rawKey = `exports/raw/${job.source}/${yearMonth}.jsonl`;
  const normalisedKey = `exports/normalised/${job.source}/${yearMonth}.csv`;
  const rawJsonl = monthRows.map((row) => JSON.stringify({
    source: row.source,
    external_order_id: row.external_order_id,
    external_line_id: row.external_line_id,
    placed_at: row.placed_at,
    record: parseRaw(row.raw_json),
  })).join('\n') + (monthRows.length ? '\n' : '');

  await Promise.all([
    env.SALES_ARCHIVE.put(rawKey, rawJsonl, {
      httpMetadata: { contentType: 'application/x-ndjson; charset=utf-8' },
      customMetadata: { source: job.source, year_month: yearMonth, job_id: String(job.id) },
    }),
    env.SALES_ARCHIVE.put(normalisedKey, toCsv(NORMALISED_COLUMNS, normaliseRows(monthRows, job.import_run_id ?? null)), {
      httpMetadata: { contentType: 'text/csv; charset=utf-8' },
      customMetadata: { source: job.source, year_month: yearMonth, job_id: String(job.id) },
    }),
  ]);

  const yearRows = await pagedItems(
    env.DB,
    'i.placed_at >= ? AND i.placed_at < ?',
    [`${year}-01-01T00:00:00.000Z`, `${Number(year) + 1}-01-01T00:00:00.000Z`]
  );
  await env.SALES_ARCHIVE.put(
    `exports/normalised/sales-history-${year}.csv`,
    toCsv(NORMALISED_COLUMNS, normaliseRows(yearRows, null)),
    { httpMetadata: { contentType: 'text/csv; charset=utf-8' }, customMetadata: { year, regenerated_by_job: String(job.id) } }
  );

  await writeMonthlySummary(env);
  return { rawKey, normalisedKey };
}

export async function writeMonthlySummary(env) {
  const result = await env.DB.prepare(
    `SELECT substr(placed_at, 1, 7) AS year_month, source,
            COUNT(DISTINCT external_order_id) AS orders,
            SUM(quantity) AS units,
            ROUND(SUM(COALESCE(gross_revenue, 0)), 2) AS gross_revenue,
            ROUND(SUM(COALESCE(net_revenue, gross_revenue, 0)), 2) AS net_revenue,
            ROUND(SUM(COALESCE(gross_revenue, 0)) / NULLIF(COUNT(DISTINCT external_order_id), 0), 2) AS AOV,
            MAX(updated_at) AS last_updated_at,
            'sales_history_items' AS import_source
     FROM sales_history_items
     WHERE source IN ('shopify', 'etsy', 'noths')
     GROUP BY substr(placed_at, 1, 7), source
     ORDER BY year_month, source`
  ).all();
  const columns = ['year_month', 'source', 'orders', 'units', 'gross_revenue', 'net_revenue', 'AOV', 'last_updated_at', 'import_source'];
  await env.SALES_ARCHIVE.put('exports/summaries/monthly.csv', toCsv(columns, result.results), {
    httpMetadata: { contentType: 'text/csv; charset=utf-8' },
    customMetadata: { generated_at: new Date().toISOString() },
  });
}

function nextMonthIso(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString();
}

function parseRaw(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return value; }
}
