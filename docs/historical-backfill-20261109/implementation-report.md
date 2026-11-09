# Historical sales backfill — implementation and evidence

Implemented on 09-11-2026 under Graham’s instruction to trial a small change, analyse each stage with Claude, then expand with testing throughout. The isolated collector change was reviewed and merged as PR #28. This report covers the separate historical feature.

## Result

ROR Sales now has **Historical sales · Monthly archive**, with a calendar-year selector covering the actual available sources. Dates stay DD-MM-YYYY. Current KPI cards, comparison tables, charts, goals and Growth reporting retain their existing data and behavior.

- **Etsy:** 11-02-2015–31-07-2025; 3,824 daily aggregates, 126 monthly aggregates, 11 bounded annual captures. All 13,886 source receipts accounted for; the unchanged eligibility policy excludes 194 unpaid/fully refunded/cancelled receipts, leaving 13,692 counted sales.
- **NOTHS:** 04-11-2015–31-07-2025; 3,558 daily aggregates, 117 monthly checkpoints grouped by calendar year. All 129,810 original placed-order-cohort records accounted for.
- **Shopify workbook:** 96 monthly revenue/order aggregates, January 2016–December 2023. Source is self-reported, with the original recorded values and no inferred daily precision.
- **Native live sources:** retain their original starts: Shopify 01-01-2024; Etsy/NOTHS 01-08-2025. The historical store ends immediately before each live boundary.

Independent API checks match all historical raw receipt/order counts. Etsy provides a bounded count for the exact historical interval. NOTHS’s API has no date filter, so ascending ranks 129,809 and 129,810 bracket the historical/live boundary. No source identifier or individual receipt detail is published. `finance/historical/coverage-check.json` is tied to the archive SHA; the browser checks the archive, workbook aggregate and coverage-proof hashes.

## Design and financial trust

The archive is under `finance/marketplaces/historical/`, structurally separate from the live staging store. The daily job still reads only its existing retained interval from 01-08-2025; it never sees the historical first days. No schedule, operational StockHub records, source database schema, inventory or OAuth-renewal ownership was changed. Source access is read-only; StockHub alone renews Etsy OAuth.

The historical archive explicitly carries `validated: false`, `confidence: historical-api-backfill`, and historical-labelled daily completeness. The unchanged live `management.marketplace()` still rejects those historical labels. The separate monthly reporter joins non-overlapping historical/live days and reuses the existing `ManagementFinance.allocatedVAT()` arithmetic. It preserves original source components, fiscal-year penny allocation, existing VAT assumptions and refund/fee treatment. This is source-checked historical management reporting, not independently reconciled accounting turnover.

Shopify workbook Revenue has no established Net/Gross/VAT basis. It is displayed as recorded revenue, monthly only, and never inserted into Net Sales or an All Stores Net Sales total. Native Shopify plus both marketplaces can produce combined Net Sales from 2024 where matching coverage exists. The optional April–December 2023 native Shopify extension was kept outside this change; those months remain labelled workbook data. Silk Fred and ASOS are excluded.

The monthly view owns its source join and year selector. Original live-only date selections and financial completeness logic stay unchanged. This resolves the spec’s open merge/grain decisions without pretending historical API controls equal live independent financial controls or manufacturing daily Shopify rows.

## Native currency and source differences

975 older NOTHS records express purchase components in USD/EUR/AUD. The historical-only adapter uses their existing native GBP listing components and original GBP order total; it never calculates an exchange rate. The raw GBP values are preserved.

A staged November 2024 capture stopped on one native-backed penny difference: individually rounded GBP components differ by one penny, while native GBP invoice subtotal less the recorded discount exactly equals original order total. Claude reviewed the narrow v2 rule and regression tests before resuming. Only that exact invoice-backed one-penny case is accepted; missing or foreign-currency evidence, a wrong invoice identity, or larger differences still fail. No amount is changed or balanced. Exactly one such case is recorded in aggregate provenance.

Seven separate unused legacy-reference mismatches total −£21.54. Original reference values are retained; discrepancies are disclosed and never used to reconstruct revenue. Per-chunk source-mapping policy identifies earlier strict v1 captures and the later compatible v2 capture.

## Workbook controls

The detailed control report is deliberately private under ignored `finance/local-data/historical-backfill/control-report.json`. It contains monthly aggregates, not published workbook structure or native order detail. The public summary is: 243 source-month rows, 231 comparable full months, all 231 flagged beyond the £0.01/exact-order-count tolerance. Etsy order counts match in 56 of 115 compared months; NOTHS counts match in 3 of 116. No recorded workbook revenue matches the approved management Net Sales at penny tolerance.

These differences are unresolved, informational comparisons against an unconfirmed workbook Revenue/count basis. They do not validate the archive financially, and no figure was adjusted to make them match. API completeness is independently checked; it does not establish workbook/accounting equivalence. This is why source qualification is retained and workbook figures are not mixed into Net Sales.

## Validation

- Every cached source capture was hash-checked, rederived and checked for global native-ID uniqueness before the archive was built. Final assembly prohibited network reads; it reused completed checkpoints.
- Tests cover both collection directions and exact live-default preservation; cross-year/mid-page resume; currency/invoice/rounding evidence; retries/cache eviction/concurrency; archive contiguity, source counts and monthly sums; corruption/last-good retention; live-path and symlink rejection; aggregate privacy; historical/live overlap; legacy basis/grain; null/zero/future periods; missing counts; and unchanged live trust rejection of historical labels.
- The full reporting/dashboard suite has 177 tests: 173 passed, four intentional private-evidence skips, zero failures. Ads and Insights pass; unchanged native Shopify reconciliation passes 42 control periods and 130 rows. Logs are recorded alongside this report. Protected original exports and both live financial stores remain byte-identical.
- Real-data desktop/mobile acceptance passes 12 historical monthly rows for 2016, source labels and withheld incompatible combined totals, complete native-compatible 2024 combined reporting, current-month cutoff, future nulls, all seven Growth tabs, and DD-MM-YYYY dates. No page errors or document overflow.
- FY26 All Stores Net Sales remains £398,139.18; current FY through 08-11-2026 remains £79,554.92. Changing the historical year does not change live page filters or those totals.
- Deliberate archive corruption is blocked, live figures remain available, and retry recovers. A separately tested missing historical loader also leaves the live dashboard working. Before/after screenshots include a pre-2024 selection.

Claude’s staged reviews found no blockers in the collector, source mapping/cursor, checkpoint kernel or monthly reporter/UI. The final completed-data review found no remaining concrete blockers and cleared the feature for PR/merge on this evidence; hosted CI remains the release check.

## Operation and rollback

Routine daily reporting requires no change. The archive backfill is a manual one-off with private resumable checkpoints. `finance/marketplaces/HISTORICAL.md` documents capture, independent count verification, aggregate bundle construction and recovery.

Only aggregate snapshots, the aggregate Shopify file, count proof and reviewed code/evidence are public. The workbook, importer’s full private output, native IDs, customer records, credentials and detailed control report are never committed. A failed historical load/validation leaves current reporting available. Restore separate historical pointers through a reviewed commit if needed; never reset main or replace live pointers.
