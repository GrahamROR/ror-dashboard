-- Financial/commercial sales import queue for the ROR Sales Dashboard.
-- date_from is inclusive and date_to is exclusive.
CREATE TABLE IF NOT EXISTS historical_import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK (source IN ('shopify', 'etsy', 'noths')),
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused')),
  job_kind TEXT NOT NULL DEFAULT 'historical'
    CHECK (job_kind IN ('historical', 'daily_refresh', 'weekly_catchup')),
  wave_year INTEGER,
  priority INTEGER NOT NULL DEFAULT 100,
  started_at TEXT,
  completed_at TEXT,
  rows_fetched INTEGER NOT NULL DEFAULT 0,
  orders_fetched INTEGER NOT NULL DEFAULT 0,
  units_fetched INTEGER NOT NULL DEFAULT 0,
  revenue_total REAL NOT NULL DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 4,
  next_attempt_at TEXT,
  import_run_id INTEGER REFERENCES sales_history_import_runs(id),
  raw_archive_key TEXT,
  normalised_archive_key TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (date_from < date_to)
);

CREATE INDEX IF NOT EXISTS idx_historical_import_jobs_next
  ON historical_import_jobs(status, priority DESC, next_attempt_at, date_from, source);
CREATE INDEX IF NOT EXISTS idx_historical_import_jobs_source_period
  ON historical_import_jobs(source, date_from, date_to);
CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_import_jobs_active_range
  ON historical_import_jobs(source, date_from, date_to, job_kind)
  WHERE status IN ('pending', 'running');

CREATE TABLE IF NOT EXISTS historical_import_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  historical_paused INTEGER NOT NULL DEFAULT 1 CHECK (historical_paused IN (0, 1)),
  updates_paused INTEGER NOT NULL DEFAULT 0 CHECK (updates_paused IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO historical_import_control (id, historical_paused, updates_paused)
VALUES (1, 1, 0);

-- Seed 2023 as the first wave and 2022-2017 as deliberately paused future waves.
-- Deployment is safe: no historical job runs until an operator resumes its year.
WITH RECURSIVE months(month_start) AS (
  VALUES('2017-01-01')
  UNION ALL
  SELECT date(month_start, '+1 month') FROM months WHERE month_start < '2023-12-01'
),
sources(source) AS (VALUES('shopify'), ('etsy'), ('noths'))
INSERT INTO historical_import_jobs
  (source, date_from, date_to, status, job_kind, wave_year, priority)
SELECT
  source,
  month_start,
  date(month_start, '+1 month'),
  'paused',
  'historical',
  CAST(substr(month_start, 1, 4) AS INTEGER),
  CASE WHEN substr(month_start, 1, 4) = '2023' THEN 300 ELSE 100 END
FROM months CROSS JOIN sources
WHERE NOT EXISTS (
  SELECT 1 FROM historical_import_jobs existing
  WHERE existing.source = sources.source
    AND existing.date_from = months.month_start
    AND existing.date_to = date(months.month_start, '+1 month')
    AND existing.job_kind = 'historical'
);
