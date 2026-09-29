# ROR Sales historical import worker

This Worker is the background control plane for financial sales history. It does
not contain inventory, SKU mapping, supplier purchasing, bought-vs-sold or
reorder logic. The live dashboard database remains the primary source.

It calls StockHub's established **sales-history month importer** through a
private Cloudflare Worker service binding. StockHub remains the only Worker
holding the Shopify, Etsy and NOTHS credentials and the single owner of the
idempotent upserts into `sales_history_orders` and `sales_history_items`. No
public StockHub URL, Cloudflare Access service token, stock, purchasing or
inventory endpoint is used. The database uniqueness rules remain authoritative:

- orders: `(source, external_order_id)`
- line items: `(source, external_order_id, external_line_id)`

## Runtime and schedules

The Worker runs on Cloudflare and binds directly to the existing production D1
database plus a private R2 bucket.

- `7 * * * *` UTC: process at most one eligible job.
- `15 5 * * *` UTC: enqueue every source/month overlapping the last seven days,
  then process one job.
- `45 5 * * 0` UTC: enqueue every source/month overlapping the last 60 days,
  then process one job. This re-reads current source records so supported late
  changes overwrite the existing line rather than creating another one.

Full calendar months are intentionally re-fetched for rolling updates and their
archive files are regenerated. Historical jobs are one full calendar month.
The queue rejects partial-month jobs until StockHub has a bounded date-range
entry point, preventing the requested audit range from diverging from the data
that StockHub actually fetched.

Historical waves are seeded in `paused` state. Deploying does not start 2023.
When resumed, ordering is January through December, Shopify then Etsy then
NOTHS. Only one source/month is processed per hourly tick.

## One-time setup

From this directory:

```bash
npm ci
npx wrangler r2 bucket create ror-sales-history-archive
npx wrangler r2 bucket create ror-sales-history-archive-staging
npx wrangler secret put ADMIN_TOKEN
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Use `--env staging` for the staging admin secret, migration and deployment.
Production binds privately to the existing `stockhub` Worker; staging binds to
`stockhub-staging`. Cloudflare requires the target Worker to exist before this
Worker is deployed. Source API credentials are not duplicated.

Required repository deployment secrets are `CLOUDFLARE_ACCOUNT_ID` and a
scoped `CLOUDFLARE_API_TOKEN`. The R2 buckets and Worker secrets must exist
before running the deployment workflow.

## Start, pause and resume

Set these locally without committing their values:

```bash
export HISTORICAL_IMPORT_WORKER_URL="https://ror-sales-historical-import.<account>.workers.dev"
export HISTORICAL_IMPORT_ADMIN_TOKEN="..."
```

Then use the repository CLI:

```bash
node scripts/historical-import-admin.js status
node scripts/historical-import-admin.js resume --target=historical --year=2023
node scripts/historical-import-admin.js pause --target=historical
node scripts/historical-import-admin.js pause --target=all
node scripts/historical-import-admin.js resume --target=updates
node scripts/historical-import-admin.js run-next
```

Resuming a historical year changes only that year's `paused` jobs to `pending`.
Future waves remain paused until explicitly resumed.

The admin CLI can enqueue a month explicitly, but the worker rejects
partial-month ranges. If source volume eventually requires smaller chunks, add
a private bounded-range entry point to StockHub before enabling those jobs.

```bash
node scripts/historical-import-admin.js pause-job --id=123
node scripts/historical-import-admin.js resume-job --id=123
```

## Retries and rate limits

Only one job is claimed per invocation. Source HTTP 429 and 5xx responses are
retried in-process up to four times while respecting a bounded `Retry-After`.
Failed jobs are then retried up to four
times with exponential delays of 15, 30, 60 and 120 minutes (capped at six
hours). A 45-minute lease prevents abandoned `running` jobs. The next runner
turn converts an expired lease into a retryable failure.

StockHub's existing source importers paginate sequentially. Processing one
source/month per hour keeps API pressure low; persistent source failures are
returned to this worker, recorded in `error_message`, and retried through the
same idempotent upsert path. Etsy continues to reuse the existing short-lived
OAuth token in D1 and refresh it only near expiry.

## Archives

R2 is private and is the only archive location. Raw records can include source
line-item details or personalisation, so they must never be committed to this
public dashboard repository.

Each successful job regenerates, rather than appends to:

```text
exports/raw/{source}/{YYYY-MM}.jsonl
exports/normalised/{source}/{YYYY-MM}.csv
exports/normalised/sales-history-{YYYY}.csv
exports/summaries/monthly.csv
```

The raw JSONL is the minimally transformed `raw_json` preserved in D1. The
normalised files contain the common commercial schema. Fields unavailable in
the current source record are blank rather than invented. Shopify discounts and
refunded/removed line quantities are preserved explicitly; shipping and tax stay
blank because the current live line-item schema does not allocate order-level
amounts to individual lines. Etsy/NOTHS refunds likewise remain blank until their
source integration supplies a reliable line-level value. Revenue basis is
explicitly `gross_line_revenue`. Monthly source
files carry the production `sales_history_import_runs.id` in `import_batch_id`;
combined annual files leave that column blank because rows in one year come
from many import runs and the live table does not retain a per-row run id.

Regenerate any affected month and its annual/summary files directly from D1:

```bash
node scripts/historical-import-admin.js regenerate --source=shopify --month=2023-01
```

## Verification

`status` returns:

- pending/running/completed/failed/paused counts by source and the latest 250
  individual jobs with their audit totals;
- actual D1 rows, distinct orders, units and gross revenue by source/month;
- earliest/latest imported sale dates;
- full-table duplicate key groups;
- failed job error messages and next retry times.

The expected duplicate-key count is zero. Archive totals should be compared
with `monthly_audit`, which is calculated from the live table and therefore
does not double-count repeated daily or weekly refresh jobs.
