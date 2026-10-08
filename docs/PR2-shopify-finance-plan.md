# PR2 — Canonical Shopify financial actuals: implementation and reconciliation plan

Prepared 8 October 2026, after PR1's automated and browser checks passed. **Planning only. No financial source data, historical export, importer, remote database, deployment or accounting mapping was changed.** The specification's native figures are supplied audit evidence, not a fresh live reconciliation performed in this task.

## Required outcome

For an identical Shopify store, reporting interval, source snapshot, currency, timezone, eligibility and adjustment policy, Growth and ROR Sales must read the **same canonical financial aggregate**. The financial headline will become verified net merchandise sales ex VAT only after definition and source verification. Shopify total sales remains separately available. Existing imported gross line sales remains separately identified for compatibility and audit; no relabelling or conversion of its amounts to net.

PR2 covers Shopify only. Combined-channel verified net sales cannot become a complete financial total until Etsy and NOTHS pass PR3. Advertising and Klaviyo attributed values remain separate. Inventory mapping and order fulfilment are outside this work.

## Verified repository evidence and unresolved source evidence

| Evidence | Current local result | Required verification |
|---|---|---|
| `scripts/fetch-data.js`, `fetchMonthlySales` | Fetches `total_sales`, `net_sales`, `orders`, `average_order_value` and costed-SKU measures. Writes total sales to `revenue`, net sales to `netSales`. | Inspect the actual available ShopifyQL schema/API version and report definitions before adding fields. Confirm native date boundaries, currency and adjustment semantics. |
| `fetchYesterday` and `fetchTopProducts` | Separate ShopifyQL queries; products also use `total_sales`. | Same financial basis across overview, yesterday, monthly, products and relevant goal consumers. Product grouping must have a reconciled residual/unassigned category rather than assuming top ten = store total. |
| `scripts/fetch-ror-sales-data.js` | Uses `SUM(gross_revenue)` and distinct `external_order_id` from `sales_history_items`, grouped by `substr(placed_at,1,10)`. Export excludes order identifiers. No refund/VAT/status/FX reconciliation or source-completeness manifest. | Secure source-level ID extracts are required to explain eligibility variances. No SKU mapping prerequisite. Do not interpret string-prefix days as confirmed London days. |
| `scripts/fetch-data.js` final writer | Spreads existing FY blocks and writes only current FY. | Closed-year refresh needs explicit staged versions and approval, not a silent change to this writer. |
| Local FY26 Growth snapshot | £312,828.22 total sales, £247,541.41 net sales, 7,813 orders. July £14,807.43 / 426 orders remains marked MTD and incomplete. | Supplied native benchmark: £313,437.06 total / £247,999.66 net / 7,832 orders; July £15,416.27 / 445. Re-fetch at a documented cutoff. Explain £608.84 total, £458.25 net and 19-order differences. |
| Local FY26 ROR Shopify | £318,134.63 imported gross lines / 7,834 orders. PR1 preserved both exactly. | Explain the two-order difference by IDs. The £4,697.57 difference versus native total sales is a **basis mismatch**, not an approved adjustment. |

The supplied FY26 native components are: gross merchandise £276,221.01; discounts −£23,601.22; sales reversals −£4,620.13; net merchandise £247,999.66; shipping £23,670.88; taxes £41,766.52; total £313,437.06. Their arithmetic reconciles, but that alone does not verify source filters or reporting date. Retain original signs, query responses and native report files.

## Gate A — Definitions and evidence required before financial changes

Produce a decision record signed off by the business/accountant and a source manifest containing:

1. **Store and period:** exact store ID/domain; GBP shop-currency policy; confirmed store reporting timezone (target Europe/London); FY26 inclusive 2025-08-01–2026-07-31, represented internally as `[2025-08-01, 2026-08-01)` in the reporting timezone; report retrieval timestamp and any source cutoff/lag. UTC conversions must respect DST rather than adding a fixed hour.
2. **Revenue:** confirm net merchandise ex VAT as headline, with shipping and taxes separately stored. Confirm Shopify's returned net-sales semantics and all additional components needed to bridge to total sales. Never divide by 1.2 or subtract commission/fees to manufacture net merchandise sales. Keep net turnover including shipping as a separately approved accountant mapping.
3. **Orders/units:** confirm eligible order statuses, test/draft/deleted/unpaid/cancelled handling, partial/full refunds, source order-count definition, zero-price orders, purchased versus returned units. Identify FY26's two additional ROR Shopify IDs and explain each with source-native status/history. An order-count variance does not license arbitrary exclusions.
4. **Adjustments:** agree transaction-date versus adjustment-date reporting for returns, cancellations and refunds, especially post-close revisions. Preserve both timestamps and original facts. Match the native report's policy for comparisons.
5. **AOV:** keep `Shopify-reported AOV` from its own native measure; calculate `netMerchandiseAov = verified net merchandise sales / eligible orders`. Zero eligible orders yields null. Do not average monthly AOVs or silently replace native AOV with net AOV. Query a native period AOV where needed, then reconcile any weighted construction against it.
6. **Provenance:** obtain reproducible FY26 and July native reports and query responses, including filters, query text, API version, access scopes, source timestamps, returned timezone/currency and pagination/completeness evidence. Request a native export if a required field or grain is unavailable. Missing facts remain null with an explanation.
7. **Accounting boundary:** confirm Xero sales/tax/shipping/fee accounts and period-close rules with the accountant. Xero is a reconciliation target, not authority to overwrite order history. Do not declare an accounting match without approved mappings and timing.

**Gate A exit:** reviewed definitions plus reproducible source figures, including ID-level explanation or explicit unresolved variance. Native reports have not been fetched in PR1. Until these requirements are met, PR2 remains planning/staging design; no published or historical financial replacement is authorized.

## Proposed implementation sequence after Gate A

### 1. Add a versioned financial contract and immutable staging

Add a separate financial schema/module (for example `finance/metric-contract.js` with JSDoc types plus runtime validation) rather than changing the meaning of `revenue`. Extend PR1's display catalog with canonical metric IDs. Each observation must include:

- `metric_id`, numeric value or null, `basis`, source/store, `source_updated_at`, import/retrieval timestamp, immutable `snapshot_id`, query/report hash, source/API version.
- `period_start`, `period_end` (exclusive), display end, reporting `timezone`, `currency`, `counting_policy` and `adjustment_policy` identifiers.
- `data_status` (`actual`, `partial`, `missing`, `unreconciled`, `estimated` as applicable), `reconciliation_status`, `last_reconciled_at`, warnings and missing-day counts; completeness distinct from financial reconciliation.
- Nullable independent amounts for gross merchandise ex VAT, discounts, reversals/refunds, net merchandise ex VAT, shipping ex VAT, taxes, total sales, eligible orders, purchased/net units where known, native AOV and net merchandise AOV. Do not imply that unavailable measures are populated.

Store money as integer minor units or exact decimals until display, with a documented precision/rounding policy. Preserve original source currency and amounts. Any FX conversion requires a verified source rate and policy. Missing tax or FX must never be silently treated as zero or GBP.

Stage raw reports and private order-ID evidence outside the public dashboard repository (gitignored `local-data/` or an approved private archive). Public aggregates must remain free of customer/order identifiers. Write a manifest with SHA-256 hashes, prior snapshot ID, transformation version, source filters, completeness, variances and approval status. Preserve existing `data.json` and `dashboard2/sales-data.json` byte-for-byte during staging.

### 2. Build a read-only canonical collector and reconciliation runner

Extract or reuse the existing authenticated ShopifyQL transport without invoking the production writer. Add an explicit staging output path and bounded store/date arguments; no default overwrite. Inspect actual returned fields before coding transformations.

Fetch daily facts plus native period/monthly reports for the same snapshot/cutoff. Prove which metrics are additive (especially eligible order counts and adjustments); do not assume every source grouping can be summed without double counting. Source-confirmed zero-sales days get explicit zero facts and coverage evidence; absent/failed retrievals stay missing.

The proposed reconciliation runner should emit machine-readable and reviewable tables with `period`, `metric`, legacy value/basis, staged value/basis, native benchmark, absolute variance, order-ID evidence reference, reason, status and reviewer. Never hard-code a variance away. Idempotency key: store + reporting date/grain + source snapshot + definition version; replaying identical input must not duplicate facts.

### 3. Review staged FY26 and July before any refresh

Produce:

- Before/staged/native values for every FY26 month, FY total and July separately, with separate total sales, net merchandise, shipping, tax, orders and AOV columns.
- Secure ID-level ledger for the 2-order ROR/native discrepancy and 19-order frozen/live July discrepancy. Do not assume these represent the same set of orders. Include additions/removals/status changes and adjustment events, plus explicit unresolved lines.
- Reconciliation of the £608.84 total-sales change and £458.25 net-sales change into supported source components. Do not assume all net difference is July without monthly evidence.
- Coverage manifest for every date, source currency and query partition, including daylight-saving boundary samples and late adjustments.

**Gate B:** business review of staged source evidence, variance report and rollback package. Any unexplained variance blocks a “reconciled” claim and blocks historical publication. The supplied spec is not approval to replace figures.

### 4. Wire both dashboards to the same verified snapshot

Add one loader/selector for canonical Shopify finance, used by Growth and the Shopify slice of ROR Sales. Keep legacy gross-line facts available under their original label. Add an explicit metric/basis selection only when compatible verified values exist. Do not silently combine verified Shopify net sales with unreconciled Etsy/NOTHS gross lines.

Update KPI cards, table, explorer, channel contribution, yesterday/monthly views and product reporting to request a defined metric ID. Goals and what-if models must declare which basis they model. Moving a total-sales goal to a net-sales basis requires an explicit goal decision, not reuse of the same target. Profit and LTV remain estimates; they do not become audited because a revenue input improved.

Replace unconditional frozen-year logic with a proposed configurable adjustment lookback plus a deliberate closed-FY refresh command, audit trail and versioned snapshot pointer. Agree the lookback duration with the business; do not choose one as accounting policy in code. Failed refreshes retain the previous immutable snapshot with visible stale/partial status.

### 5. Acceptance and rollout gate

Automated requirements:

- Canonical native net merchandise equals both dashboards for the same date/filter contract; currency differences bounded to the agreed rounding tolerance (normally pennies, never a hidden balancing adjustment).
- Daily/monthly/FY totals reconcile for additive metrics; coverage and eligibility match. Net AOV uses period totals and null for zero orders. Native AOV remains independently labelled/tested.
- Discounts, full/partial refunds, cancellations, unpaid orders, returns after close, shipping-only refunds, tax-exempt/mixed tax, foreign currency, missing tax/refunds, zero-price goods, multi-line orders, midnight BST/UTC, missing SKU and revised past-period orders all have fixtures.
- Duplicate replay is idempotent. Re-running a failed staged batch cannot partially publish. All exports retain original snapshots and provenance.
- Missing full month/date interval or missing channel suppresses valid-looking growth/profit and marks combined-channel finance incomplete. 2024 remains available; unavailable 2023 remains explicit.
- Keep PR1 date/render/UI contract tests. Run `node dashboard2/test/calculations.test.js`, reporting/date-control tests, Ads and insights suites plus focused new finance/collector tests. Run StockHub `npm run check` and importer tests only if later implementation actually touches that repository.

Manual comparisons: November 2025 (Black Friday), July 2026 (known stale snapshot), and a refund-heavy month selected from real adjustment evidence, plus full FY26 and latest closed month. Capture query/report exports and screenshots of both dashboards using identical selections. Record source cutoff differences rather than accepting unexplained timing excuses.

**Gate C — separate explicit approval required:** replace the published FY26 snapshot, merge to main or deploy. Review the exact staged snapshot/hash, before/after matrix, tests and rollback pointer first. PR2's source verification and approval do not authorize production deployments automatically.

Rollback: restore the prior versioned published aggregate pointer and compatible reader release; retain new staged facts and audit evidence for investigation. Do not delete raw financial history or mutate inventory/fulfilment. Dry-run rollback locally and compare checksums before asking for rollout approval.

## Follow-on boundaries

PR3 must inspect real Etsy receipts/payments/refunds fields and obtain NOTHS native exports before finance transformations. Resolve Etsy's 9-order / £2,280.16 reported variance by ID, not exclusion guesses; its 49 absent FY26 daily rows currently have unknown zero-versus-missing meaning. Commission/payout fields remain expenses/settlement dimensions.

PR4 stages the missing 2025-08-01–21 Meta and Google history, preserves ads snapshots and merges one row/date/platform idempotently. Meta's supplied missing £3,186.02 / 240 purchases is a benchmark to verify, not a fabricated backfill. Google has no supplied native total. Audit primary conversion action IDs and Meta purchase-event fallback rules; attribution remains separate from financial actuals. PR1 added visible coverage warnings but did not backfill anything.
