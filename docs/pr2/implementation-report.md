# P2 implementation and review gates — 8 October 2026

P1: `codex/pr1-reporting-controls-review`, commit `011e7fbd356e1c0ae1d7baa7ad0ea1706ecd42cd`, [PR #14](https://github.com/GrahamROR/ror-dashboard/pull/14). It was isolated from the original dirty checkout and based on latest main `9fdb6e367589bf47181a5ecb8ad9835848ba7c34`; main was fetched again before P2 finalisation and remained unchanged.

P2: `codex/pr2-canonical-shopify-finance`, based on P1 so its PR shows only the finance changes. Review/merge P1 first; P2 is not authorization to merge or deploy either branch. Original uncommitted importer and unrelated dashboard/data work remains in the original checkout.

## Outcome

Both dashboard entry points now use one canonical Shopify reporting contract in the opt-in staging workspace (`?finance=staging`). Gross merchandise, net merchandise, original total sales, native orders, net AOV and original Shopify AOV are explicitly distinct. Net merchandise is the proposed staging management default; accountant approval remains pending. Dates use the P1 shared resolver and London reporting days, including August–July financial years.

The latest completed-day source capture spans 1 January 2024–7 October 2026: 1,011 daily rows and 14,847 product/day rows. The store is `rockonruby.myshopify.com`, shop ID `72244527391`, GBP, Europe/London; its current `taxesIncluded` flag is true. Native reports were captured on 8 October 2026. All eight additive measures agree exactly with 44 independently queried monthly/period controls. Daily native AOV is also preserved. Product amounts reconcile, including an unassigned category; product-level orders are not used as store order counts.

FY26 staged results exactly match the user's independently supplied comparison benchmarks: gross £276,221.01; net £247,999.66; total £313,437.06; orders 7,832. No benchmark enters the transformation logic. See [full reconciliation](reconciliation.md) and [machine-readable rows](reconciliation.json).

The original Growth FY26 total was £312,828.22, net £247,541.41 and orders 7,813. All eleven pre-July months match on those measures. July changes from £14,807.43 total / £11,161.42 net / 426 orders to £15,416.27 / £11,619.67 / 445 in staging. The original July was marked MTD/incomplete. FY26 native AOV is £32.22 versus the original summary's £32.23; source monthly AOV precision is retained instead of rounding/averaging into another metric.

## Completed validation

- **114 automated cases passed, zero failures:** 23 finance; 12 ROR calculations; 18 reporting contract; 11 rendered preset cases (33 selectors); 16 Ads; 34 insights.
- Finance checks cover native controls, month/FY/calendar/custom intervals, invalid/missing dates, refunds after close, signed discounts/reversals, shipping-only refunds, mixed/zero/missing tax, zero-price goods, order counts, non-additive product orders, duplicate/truncated source rejection, wrong store/currency, London DST, deterministic replay, failure retention, and rollback between versions.
- Financial browser tests: 33 date/basis comparisons across both dashboards, all ten dashboard/section combinations, four control months (November 2025, July 2026, December 2025 with £1,349.79 reversals, September 2026), five mobile sections, manifest failure and integrity failure. Zero page errors.
- Original/P1 browser regression: all 33 selector presets, independent dates, no 390px page overflow, all seven original Growth tabs. Zero page errors.
- All five original data/attribution exports pass byte-for-byte SHA-256 checks. No changes to production writers, Ads/Email calculations, Etsy/NOTHS calculations or historical source records.
- Direct Admin collector query was schema-validated for `read_reports`; retries, object-row normalization, partial custom months, immutable capture names, errors and currency validation are mock-tested. Actual live evidence was retrieved through the connected Shopify read-only tool. No direct-token live collector run is claimed.

Full results: [test-results.txt](test-results.txt). Browser evidence: [Growth FY26](screenshots/growth-fy26.png), [ROR FY26](screenshots/ror-fy26.png), [mobile](screenshots/mobile-definitions.png). A dependency-free PR workflow runs public automated/reconciliation checks; the two private evidence replay/validation cases run locally only. Native order eligibility is delegated to Shopify’s reported measure; the tests do not claim to independently validate individual unpaid/cancelled order statuses without an ID extract.

## Outstanding decisions/evidence

1. **Accountant/business:** approve the net-merchandise management default, VAT history, Xero shipping/tax/fee accounts, financial-period close/revision policy and adjustment lookback. Current tax-inclusive pricing alone does not establish historical accounting treatment. Native historical zero tax values are preserved.
2. **Secure order reconciliation:** original ROR has 7,834 FY26 orders versus native 7,832. Neither preserved export includes order IDs. Obtain the D1 Shopify `external_order_id` extract with placement timestamps/status/source provenance and a matching native order report, then join by verified Shopify ID. Investigate the two extra imported orders individually; do not add an arbitrary exclusion. Separately explain the frozen/live July 19-order change using the original cutoff's ID/status/adjustment evidence. These variances are explicitly open despite exact aggregate dashboard/native agreement.
3. **Historical component ledger:** July's extra £150.59 beyond the £458.25 net change is the combined shipping/tax/other difference. The old export lacks those components; retrieve the old report if a detailed split is required. No invented allocation was made.
4. **Native custom-period AOV:** intervals without an exact source-period query display unavailable for native AOV; additive measures and net AOV still work. Capture an exact native query for additional required intervals. Source-side update timestamp and original connector API version were not exposed.
5. **Publication approval:** review the immutable snapshot/hash, reconciliation, staged UI and rollback. Only then authorize a separate production cutover and historical publication. Original production financial surfaces intentionally remain unchanged outside staging. Existing total-sales goals, margin and LTV estimates are not silently converted to the proposed net basis.

The supplied Etsy workbook was read as reference evidence only. Its summary explains the nine fully refunded Etsy orders, superseding the older P2 planning document's assumption that those nine were unexplained; accounting turnover remains unverified. No Etsy or NOTHS calculation/data was changed. P3 remains separate.

Native definitions: [Shopify sales reports](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/sales-report) and [sales dataset](https://shopify.dev/docs/api/shopifyql/latest/schemas/sales_revenue/sales). Operations and safe refresh/rollback commands: [finance README](../../finance/README.md).
