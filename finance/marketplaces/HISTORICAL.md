# Historical sales archive

This is a manually run, one-off archive for ROR Sales. It is structurally separate from the daily marketplace pipeline. Never schedule the backfill or put its historical days into `finance/marketplaces/staging/`: the live job intentionally rereads its own entire retained interval.

The separate **Historical sales · Monthly archive** panel joins historical and live source data in `finance/historical/reporting.js`. Existing KPI cards, charts, goals and Growth reporting keep their original inputs. No live snapshot, `automatic-refresh.js`, `finance/management.js`, stock records or OAuth lifecycle is changed.

## Sources, calculations and precision

Etsy and NOTHS history comes from their native APIs. Historical marketplace days carry `completeness: historical-api-backfill`; the archive carries `validated: false`. They are source checked, not promoted into the independent-control-backed live contract. The existing live `marketplace()` gate still rejects these historical-labelled rows.

The separate monthly reporter reuses `ManagementFinance.allocatedVAT()` on a non-overlapping historical/live union. Etsy retains merchandise less discounts plus shipping, with the agreed 20% VAT management adjustment. NOTHS retains original GBP order totals and the original placed-order cohort, using the same adjustment and fiscal-year penny allocation. No extra refund/fee deduction, FX estimate or accounting certification is introduced.

Some older NOTHS receipts express purchase components in the buyer's currency. The historical-only adapter uses the API's original native GBP listing items, discount and delivery, requires an exact `items - discount + delivery == order_total` identity, or an exact native GBP invoice-subtotal-minus-discount identity with only a one-penny difference from individually rounded components, and then calls the unchanged strict collector/normalizer. It never calculates an exchange rate or changes a recorded amount. Native-backed one-penny component differences are explicitly counted and retained in provenance; larger or unsupported differences fail. A separate legacy `listing_total_with_discount` reference can differ; its original value is retained and aggregate discrepancy counts/pennies are recorded. It is not used to balance any financial amount.

Shopify workbook data remains monthly recorded revenue and order counts, labelled **self-reported**. Only complete months ending before the canonical Shopify snapshot's first day are exported. Its Net/Gross/VAT basis is unestablished, so it never substitutes for Net Sales or contributes to an All Stores Net Sales total. Daily Shopify history is not fabricated. Silk Fred and ASOS are excluded.

The reporter rejects overlaps, duplicates and historical days masquerading as live-validated. Missing source days are explicitly labelled recorded subtotals; they cannot generate a complete combined figure. First API months can therefore be partial. Current months show their actual reporting cutoff; future periods stay unavailable.

## Capture, resume and verification

Use the existing credential environment; StockHub alone refreshes the Etsy OAuth token. Credentials and native identifiers never enter public files or logs.

1. Run `node scripts/import-sales-spreadsheet.js` to refresh the private workbook-derived input. Keep both files under ignored `local-data/`.
2. Run `node scripts/backfill-marketplace-finance.js`. `--channel etsy --capture-only` and the corresponding NOTHS option allow independent staged capture. `--force` recaptures instead of reusing validated private checkpoints.
3. Run `node scripts/verify-historical-coverage.js`. It compares the full historical Etsy API count with captured raw receipt counts. For NOTHS, which has no date filter, it checks the ascending ranks immediately before and after the historical/live boundary. The proof is tied to the archive hash and concerns order-count completeness only.
4. Run `node scripts/publish-historical-sales.js` to prepare the aggregate Shopify file and hash-checked browser registry. It requires the matching coverage proof. Review and publish all bundle files together through a normal PR and CI.

Nothing in these scripts pushes commits or changes the live reporting stores. Every boundary is derived from the first actual day in the relevant live snapshot, never its latest covered date. Outputs and private caches reject live-path aliases, including symlinks.

Etsy captures are bounded calendar-year chunks. NOTHS year groups have monthly private checkpoints to keep global-count stability windows short. Each successive NOTHS checkpoint resumes from the boundary-crossing page, rereading that page rather than skipping its remaining orders. Native IDs are checked for uniqueness across all private chunks before an archive is published. Count changes and transient reads retry with cleared transport state; source identity/currency defects fail closed.

Raw captures stay under ignored `finance/local-data/historical-backfill/`, with private directory/file permissions. Completed checkpoints are hashed, independently rederived on reuse and bound to their dates, source and cursor. Public snapshots contain only daily/monthly aggregates, source hashes and aggregate provenance. The workbook and native per-order records are never committed.

Detailed month-by-month workbook comparisons also remain private in that cache. They compare native original totals and the agreed management Net Sales with workbook-recorded revenue, whose definition is unconfirmed. A £0.01 revenue tolerance and exact count comparison flag differences; they never reconcile amounts or approve historical figures. The public implementation report records the comparison summary.

## Serving and recovery

The browser loads history only when its panel is opened. It checks the separate registry, aggregate hashes, source confidence and non-overlapping boundaries. A historical loading/validation failure leaves current reporting available.

A failed capture leaves the last historical archive pointer intact. Retain immutable historical snapshots and restore the separate historical registry/source pointers through a normal reviewed commit if needed. Never reset main or replace live pointers to roll back history. The daily job continues to use only its original live staging path and original start date.
