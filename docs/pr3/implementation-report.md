# P3 review report — Etsy financial accuracy and NOTHS evidence

P3 uses the existing ROR Sales interface and P2 shared penny/date primitives. It adds no dashboard or navigation. P1/P2 remain open and unmerged; P3 is stacked on P2 commit `00593ec3d563c5a61761ddc64ff699d18446a1b9`. Latest main was inspected: `02e2f3c750acaefaebbca733e62efa9cd44910fd`; its five newer daily exports were used in a separate browser fixture, never copied over branch/production exports.

## Financial outcome

| FY26 source/view | Before | Staged after | Source / status |
|---|---:|---:|---|
| Etsy revenue | £32,670.15 imported gross | £30,389.99 Stats merchandise | Exact annual + all 12 workbook months; live receipts corroborate amounts |
| Etsy orders | 1,060 imported | 1,051 Sold Orders | 1,047 completed + 4 partial; 9 native cancelled excluded |
| Etsy AOV | £30.82 imported gross | £28.92 | Corrected source sales / eligible orders |
| NOTHS dashboard revenue | £116,150.70 imported item gross | £116,150.70 unchanged | Native API item gross matches; net reporting unreconciled |
| NOTHS native monthly gross | £122,476.34 | £122,476.34 | All 12 months = item gross + native delivery £6,325.64 |
| NOTHS product report | £119,478.24 | No adjustment | Scope unresolved; dispatched-only order totals are £12.03 higher |
| All Stores revenue / orders / AOV | £466,955.48 / 12,680 / £36.83 | Unchanged | Labelled legacy imported gross, not consolidated net |
| Shopify FY26 gross / net / total / orders | £276,221.01 / £247,999.66 / £313,437.06 / 7,832 | Unchanged | P2 modules and snapshots untouched; all three bases checked |

See [reconciliation.md](reconciliation.md) for every month, original/corrected/native amounts, source differences and evidence requests. [reconciliation.json](reconciliation.json) contains penny-precise machine-readable results. The Etsy workbook and brief were read in full; document suggestions to change StockHub or involve Xero were not adopted because the current request prohibits them.

## Implementation and preserved features

The original KPI cards, comparison table, channel contribution and Sales Explorer consume the source-specific Etsy aggregation only for Etsy-only views. All Stores and mixed-channel series keep each channel's legacy imported gross values, including contributions and AOV. NOTHS calculations are unchanged. All three date selectors retain the same 11 P1 presets and inclusive London periods. Missing or unverified coverage withholds revenue/order/AOV and comparisons, rather than inventing zero or falling back to gross under a net label.

Etsy basis choices distinguish Stats merchandise, original merchandise and Sold Orders total. AOV uses the selected basis divided by the same eligible orders. Units stay imported with independent coverage. Shopify native AOV, goals, forecasting and advertising attribution are unchanged. Both dashboards retain their layouts, existing tabs, tables, controls, charts, goals and sliders. Tests exercised Overview, Yesterday, Monthly, Products, Email, Ads and Margin on desktop and mobile.

Browser testing found an existing SVG bug for 100% single-store donuts. A full ring now uses two outer and two inner arcs; multi-channel geometry is unchanged. A cached copy of the old chart script was also detected: the three changed ROR scripts now have cache-versioned URLs. The final browser verifies the four-arc ring and accurate financial values.

## Validation

- **129 existing test cases and 32 new P3 tests pass**, covering 12 Etsy months, source calculations, every basis/period, discounts, full/partial refunds, duplicates, missing fields, GBP precision, London DST, NOTHS differences, historical/recent coverage, P2 preservation, All Stores and failures/rollback. The combined Node harness reports 75 passing entries because five legacy runners print their individual cases internally. [Full output](test-results.txt).
- **57 real browser checks pass**, with zero final console errors. Actual viewport widths were measured: desktop 1440px and mobile 390px; no document horizontal overflow. Custom date input was committed with native keyboard input because the browser automation's date fill alone did not trigger React state. All 11 presets were exercised in each of the three selectors, all six granularities, all four metrics, the contribution/Explorer modes, Shopify financial bases and the existing forecast slider. [Browser results](browser-results.json).
- Native API evidence: all 1,060 Etsy FY26 receipts and all 3,786 NOTHS FY26 orders were read using GET requests. Etsy source amounts and eligibility match the workbook/CSV; 11 CSV dates were corrected to London daily timestamps, none across a month boundary. NOTHS native monthly gross reconciles in all 12 months.
- Current collector test: 24 Etsy and 72 NOTHS records for 1–11 October 2026 passed required-field validation. These new-year candidates remain private/unpromoted until independent native report controls are supplied. [Refresh evidence](../../finance/marketplaces/native-refresh-validation.json).
- Source-derived staging rollback: August-only → complete FY26 → failed import retaining last-good → rollback to August → roll-forward to identical complete FY26. Both immutable snapshots remain private; original/production records were not changed. [Rollback evidence](rollback-validation.json).
- P2 reconciliation still passes 41 native control periods / 130 before-after rows. SHA checks confirm `data.json`, ROR `sales-data.json`, Ads, Email and LTV/CAC files are byte-identical to the P2 baseline.
- StockHub checkout stayed at `3c24027f128b9d42711d4b9b15c1c7ea5b1db989` with the same pre-existing human changes/untracked files observed at entry. Read-only D1 token lookup reports rows_written=0 and changed_db=false. No StockHub code, orders, jobs, importers, inventory or schema changes; no OAuth refresh. No Xero calls, connections, imports or changes.

## Source refresh and outstanding issues

The dashboard-owned GET collectors are working; their output is private, explicit unverified source evidence. A controlled paired CSV + native timestamp + independent Stats-control import creates immutable aggregate snapshots and updates only the staging pointer. Newly declared complete months can be added or existing months re-imported for late source changes; undeclared months survive unchanged. Failures retain the last-good manifest and show a browser warning. The browser failure injection confirmed both warning and retained FY26 figures.

The approved production automated exports and P2 staging workflow are untouched. Only reporting CI adds P3 tests/reconciliation. No production collector schedule or promotion workflow was enabled. Interim operation: review the current month weekly, import after monthly native controls close, recheck the prior two months and explicitly re-import any older corrected month. No nightly rebuild of all historical order records is required. [Commands and operational/release/rollback plan](../../finance/marketplaces/README.md).

Remaining evidence requirements:

1. Etsy FY27 native Stats revenue/order controls and paired exports for new/revised complete months. FY26 policy is not automatically promoted to verified new-year reporting. Current and other uncovered Etsy periods clearly show financial coverage unavailable; All Stores imported reporting remains available.
2. Etsy's five order-total residuals £16.51 remain documented and preserved. Source Sales Tax=0 does not prove VAT-exclusive turnover. Partial refunds are not automatically subtracted again.
3. NOTHS product-report order-level drill-down, inclusion/exclusion/date rules, and refund/credit export with effective dates and merchandise/delivery/VAT allocation. API original item/discount/delivery/refund status fields are accessible, but do not establish that product-report scope or a refund-period eligible-order/net-sales contract. Source VAT/commission components are retained, not inferred or used as canonical net merchandise sales. The report documents component identity exceptions without manufacturing a rounding adjustment.
4. Consolidated net sales must wait for compatible verified definitions and ongoing controls across all three channels. All Stores stays legacy gross meanwhile.

The working review checkout is `/tmp/ror-pr2-recovered`; aggregate snapshots and reports are committed, and the original workbook/CSVs remain untouched in Drive. Archive private API/source evidence from the local checkout in an approved durable private staging location before production activation.

Owner approval is still required for merge, deployment, production workflow activation or publication of corrected production financial reporting. Release order is P1 → P2 → P3 with another compatibility check against then-current main. Rollback is the retained snapshot pointer or a code revert to P2; original exports require no backfill or restoration.

## Visual evidence

P2 before images use the existing preview/export dated 8 October; P3 after images use an isolated fixture of the 12 October main exports. Both use FY26, matching store/date filters and desktop size. This distinguishes expected fresh-data differences from interface changes.

| View | Before | After |
|---|---|---|
| ROR Etsy desktop | [Screenshot](screenshots/before-etsy-desktop.jpg) | [Screenshot](screenshots/after-etsy-desktop.jpg) |
| ROR All Stores desktop | [Screenshot](screenshots/before-all-stores-desktop.jpg) | [Screenshot](screenshots/after-all-stores-desktop.jpg) |
| Shopify Growth desktop | [Screenshot](screenshots/before-growth-overview-desktop.jpg) | [Screenshot](screenshots/after-growth-overview-desktop.jpg) |
| ROR Etsy mobile | — | [Screenshot](screenshots/after-etsy-mobile.jpg) |
| ROR All Stores mobile | — | [Screenshot](screenshots/after-all-stores-mobile.jpg) |
| Shopify Growth mobile | — | [Screenshot](screenshots/after-growth-overview-mobile.jpg) |
