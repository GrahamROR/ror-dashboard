# PR16 current-year release follow-up — 12 October 2026

PR16 remains stacked on open P2. No merge, deployment, production financial write, StockHub change or Xero integration. Latest main was fetched and is still `02e2f3c750acaefaebbca733e62efa9cd44910fd`; its latest five exports are used in the isolated test preview. P1/P2 and the reviewed P3 snapshots remain intact.

## What Etsy users see now

The default is Etsy Stats merchandise sales. With only FY26 financial evidence validated, all four current trading presets show **— for revenue, eligible orders and AOV**, with explicit missing financial coverage. They do not show zero, a partial-year net total or imported gross under a net label. Imported purchased units remain visible with independent source coverage; this follow-up also fixes their card/table/chart quality flags when financial coverage is unavailable.

The existing small selector now offers **Etsy legacy imported gross — unreconciled**. Only explicitly selecting it restores imported revenue, imported orders, gross AOV, comparison tables, contribution and Explorer. It applies the same legacy definition to current and comparison periods, including FY26; it never compares current gross against historical verified net. Incomplete imports still suppress growth. Etsy's choice is independent of Shopify's basis, targets and forecasting. Explorer has the same Etsy selector when its independently selected store is Etsy.

Exact results with the latest main export (generated 12 October; dates through London yesterday):

| Preset | Inclusive dates | Default net revenue/orders/AOV | Explicit legacy gross | Imported orders | Legacy AOV | Imported units | Import quality |
|---|---|---|---:|---:|---:|---:|---|
| Current FY | 1 Aug–11 Oct 2026 | All unavailable | £5,960.40 | 190 | £31.37 | 240 | Recorded subtotal; 11 absent day entries |
| This month | 1–11 Oct 2026 | All unavailable | £662.95 | 24 | £27.62 | 29 | Latest imported day marked partial |
| Last 30 days | 12 Sep–11 Oct 2026 | All unavailable | £1,282.45 | 45 | £28.50 | 54 | Recorded subtotal; 8 absent day entries |
| Last 7 days | 5–11 Oct 2026 | All unavailable | £407.35 | 17 | £23.96 | 18 | Latest imported day marked partial |

Amounts are calculated from the imported rows, not benchmarks inserted into code. Dates/amounts advance with source updates. Missing days may represent zero sales or missing imports; they are not filled with assumed zeros. None of these legacy amounts is labelled reconciled net. Default net contribution is unavailable; explicit legacy contribution shows recorded gross with coverage warnings. Revenue/order/AOV MoM/YoY remains unavailable for these incomplete/partial ranges. A calculation guard also rejects different financial or eligible-order definitions.

The Page selector controls KPIs and contribution. Comparison dates and Explorer dates/store remain independent, as in the original interface. To compare the same Etsy period throughout, choose Etsy and the same preset in those controls. All Stores still uses its original legacy gross figures for every channel.

## Exactly what to provide for August and September 2026

Four original, unedited Etsy CSV downloads:

1. **Orders**, August 2026 — staging filename `EtsySoldOrders2026-8.csv`.
2. **Etsy Payments Sales**, August 2026 — existing export format/staging filename `EtsyDirectCheckoutPayments2026-8.csv`.
3. **Orders**, September 2026 — `EtsySoldOrders2026-9.csv`.
4. **Etsy Payments Sales**, September 2026 — `EtsyDirectCheckoutPayments2026-9.csv`.

Use **Shop Manager → Settings → Options → Download Data → Orders**; select CSV Type, Month and Year, then download. Do not substitute Order Items, deposits or a fees statement. If Etsy uses different filenames/headers, send the untouched downloads; we will map/validate them privately, not edit the source or guess missing fields. [Etsy's official download instructions](https://help.etsy.com/hc/en-us/articles/360000343328-How-to-Download-a-Spreadsheet-of-Your-Sold-Transactions).

Also provide **two independent Stats captures**: one covering 1–31 August 2026 and one covering 1–30 September 2026. In Shop Manager Stats use the date selector for each complete month and save a screenshot or PDF showing **the selected dates, Revenue, Orders and GBP**, plus capture date/time. Show report/store timezone if visible; otherwise leave it unknown for the boundary review. A month/day Stats download can be included if available, but is not assumed to exist. These controls must come from Stats itself, not an Excel calculation from the four CSVs. Etsy documents Stats revenue as Orders value less discounts, excluding fees/shipping and fully refunded cancelled orders; we still verify new-year evidence rather than automatically extending FY26 eligibility/refund treatment. [Official Stats definition](https://help.etsy.com/hc/en-us/articles/360016388633-How-Is-Revenue-in-My-Shop-Stats-Calculated).

Required CSV evidence is order IDs/dates, GBP, original merchandise, discounts, shipping/tax/order total; paired payment IDs/order IDs, gross/refund/fee amounts, currency/exchange and settlement status. Keep refunds/cancellations included, not manually filtered. We collect native receipt timestamps/status/financials read-only; you do not need to supply an API token or credentials.

## Prepared validation/import process

`etsy-stats-intake-template.json` contains **null amounts and false review flags**. It is an intake template, not manufactured financial data. The new `prepare-etsy-controls.js` accepts paired source files plus independently transcribed Stats revenue/order evidence. Missing controls, policy review, mismatches or unknown confirmed London boundaries stop preparation. The importer separately requires independent Stats/review metadata for periods outside the verified FY26 window.

1. Preserve the original downloads/Stats captures privately with hashes and capture times. Compare exports and native London receipt timestamps; identify boundary differences, duplicates, missing fields, currencies, fully/partially refunded receipts, discounts and tax treatment. Review any differing FY27 eligibility/refund behavior explicitly.
2. Fill private Stats intake from independent captures, document policy/boundary/tax review, then prepare source controls. No amounts in the blank template are auto-filled from previous-year benchmarks.
3. Collect native receipts with `collect.js etsy '2026-08-01T00:00:00+01:00' '2026-10-01T00:00:00+01:00' finance/local-data/fy27-native.json` using existing read-only credentials. No StockHub token writes or OAuth refresh.
4. Run preparation and import into **private staging first**:

```sh
node finance/marketplaces/prepare-etsy-controls.js SOLD_DIR PAYMENT_DIR \
  finance/local-data/fy27-stats.json finance/local-data/fy27-controls.json
node finance/marketplaces/import-etsy.js SOLD_DIR PAYMENT_DIR \
  finance/local-data/fy27-controls.json finance/local-data/fy27-native.json \
  finance/local-data/fy27-staging
```

A read-only receipt candidate for August/September was collected on 12 October: 177 native receipts across two pages. It remains private and unpromoted; this is not a verified Stats order count and does not replace the requested exports/controls. The audit is in `etsy-native-intake-read.json`.

Seed that private staging directory from the retained FY26 snapshot before importing. Verify each new month against Stats to the penny and exact eligible order count; confirm every retained FY26 daily/monthly figure is unchanged, validate custom ranges/AOV/definitions across components, simulate failure/rollback and obtain review before publishing any new source snapshot. A synthetic August/September integration test already exercises this complete process, policy/scope failures and last-good preservation; **no real August/September net figures have been imported**.

Adding August/September coverage does **not** verify October. September-only net becomes available, but Current FY through October, This Month, Last 7 and ranges spanning October still withhold full-period net totals until that coverage is validated. The current importer verifies complete months; October MTD/daily production promotion is not implemented or enabled. Until a separately validated partial-period process is accepted (or October closes), use explicitly selected legacy gross for current trading. A future partial-period process must use exact through-date controls, exclude incomplete/today rows, retain missing-day flags, recheck late source changes and reconcile native Stats without silently extrapolating closed-month results.

## NOTHS: new product/refund findings

The verified bridge is preserved in every FY26 month: **£116,150.70 original item gross + £6,325.64 delivery = £122,476.34 native monthly gross**. All 3,786 previously captured order IDs were refreshed read-only and source gross remained identical. The first broad refresh encountered HTTP 502; no old capture or public snapshot was replaced. Validated read-only ID batches with bounded retries then completed. This is an existing-cohort refresh, not a claim to discover additional historical records.

The supplied product report contains **300 Available products**, of which **233 traded**. Native FY26 receipts contain **293 products**. For all 233 trading report rows, the observed API ID/report-code relationship is corroborated independently by exact title, distinct order count and units. All 233 match the **whole captured order cohort**, not dispatched-only counts; 22 differ from dispatched-only counts. Thus the old £12.03 near-match to dispatched-only totals is **not a reconciliation or eligibility rule**.

**60 native products, 111 units and £2,804.23 original merchandise gross are absent from the product CSV**. A diagnostic equal allocation of charged delivery across order-item lines, accumulated as exact rational amounts before product rounding, reproduces **231 of 233 product gross values exactly**. Two remain £0.01 lower in the report: product codes **1286275** and **1563501**. The half-up diagnostic totals **£119,478.26**, against actual **£119,478.24**. These pennies are retained, not “fixed”. Catalogue scope plus allocated delivery strongly explains the gap; the platform's exact filter, allocation and rounding policy still needs confirmation. This model is diagnostic only and is not wired into dashboard financial reporting.

Refund evidence: **18 refunded-state orders total £822.84**; **nine dispatched orders with refunds total £118.97**; combined cumulative `refund_total` is **£941.81**. For the 18 refunded-state orders, source order totals sum £816.57, a £6.27 difference from cumulative refunds; this is documented, not assumed to be fees or VAT. The inspected order GET responses and advertised read links do not supply individual refund posting dates, per-item/delivery/VAT allocation or a refund-event ledger. Neither `updated_at` nor `refund_total` proves the correct reporting date/basis. Orders marked dispatched can have refunds; status-only exclusions would be wrong. No net calculation is promoted.

## Precise remaining NOTHS exports and how to obtain them

- **Re-export the FY26 Products report with all product statuses**, including unavailable/retired/deleted products if the report permits, and an accompanying filter/date view. Use the same NOTHS partner/CMS report used for the existing `products_01aug2025-31jul2026.csv`, with dates 1 Aug 2025–31 Jul 2026. Keep the original Available-only export too. If archived/deleted products cannot be included, request their historical drill-down from Partner Support.
- **Order-item drill-down behind that report**, including order ID, order-item ID, API product ID and report Product Code, placed/reporting timestamps and timezone, status, quantity, original item gross, item/order discounts, original and charged delivery, allocated delivery, tax/VAT fields and the report's inclusion/allocation/rounding definitions. Prioritise the 60 omitted products and the two penny-residual product codes, but retain a complete FY26 cohort for checks.
- **Dated refund/credit ledger**, for all refunds affecting FY26 orders through the extraction date (including refunds posted after 31 July). Each event needs original order/item ID, refund/credit ID, posting/effective date, currency, customer refund amount and merchandise/delivery/VAT allocation, plus cancellation status/date where applicable. Keep commission/fee credits separate from customer refunds.
- **Partner financial statements and credit notes** covering August 2025–July 2026 and later periods containing refunds of those orders. Download CSV where offered and PDFs/credit notes where CSV lacks details. These support the £6.27 refund/order-total difference and distinguish customer adjustments from fee credits; settlement profit is not commercial sales revenue.

The authenticated NOTHS report/statement UI and available export buttons could not be verified from public documentation, so no invented menu/button path is provided. Use your existing partner/CMS report and financial-statement download area; if it does not expose the requested fields, send the request below to **your NOTHS Partner Support channel**. Do not use customer-service contact details or send credentials. We have not contacted anyone on your behalf.

> Please supply the order-item drill-down and dated customer-refund/credit ledger supporting our Rock On Ruby FY26 commercial sales reports (1 August 2025–31 July 2026), including all product statuses and later refunds against those orders through the extraction date. Our monthly gross report reconciles to £122,476.34, while the Available-products report totals £119,478.24. The captured order cohort includes 60 products absent from that product report. Please include the fields listed above and confirm catalogue eligibility, shipping allocation, discount/refund treatment, reporting dates/timezone and penny-rounding policy, particularly product codes 1286275 and 1563501. Separate customer refunds from commission/fee credits and explain any refund exceeding the original order total.

## Practical production rollout — separate Shopify from marketplace gates

**P1/P2 can be considered independently of PR16.** Their real credential-backed staging refresh/rollback checks already passed; see [P2 evidence](../../pr2/review-follow-up-20261012.md), including runs 38226860648 and 38229158874. These were production-equivalent source reads in staging, **not a production deployment or production rollback**.

1. Obtain separate owner approval for P1/P2. Recheck then-current main, run reporting CI and a fresh credential-backed P2 staging refresh if evidence is no longer current. Verify historical controls, source store/date/basis, all five protected exports and rollback before publication. Do not combine PR16 into that release.
2. Capture the exact existing production revision, manifest/snapshot hashes, protected export hashes and workflow settings. Archive private source/audit evidence durably in an approved private location. After approval, publish the reviewed P1/P2 code and approved canonical snapshot together; do not overwrite the historical imported exports. Check both original dashboards, FY26 benchmarks and latest-day missing/partial handling immediately.
3. Enable a production canonical Shopify refresh only with explicit approval of that workflow/configuration. Preserve the existing non-financial daily exports, validate inputs/controls before atomically publishing a new immutable snapshot pointer, and retain old snapshots. A failed collection/validation must leave last-good data and surface failure, never replace it with incomplete data.
4. **Hold PR16 production release** until current-year UX is accepted and the August/September evidence passes private staging validation; agree the ongoing closed-month/current-trading coverage policy explicitly. NOTHS net sales and consolidated net sales remain gated on missing source evidence. No workflow activation or production data promotion is included in this PR follow-up.
5. On an approved production release failure, pause only the new canonical refresh and restore the retained code revision and manifest/snapshot/status as one coherent set. Existing imported exports and StockHub need no backfill or restore. Verify the five protected exports, original features and financial/source labels, then investigate in private staging before retrying. Actual production rollback execution requires approval.

## Testing and review evidence

All existing suites plus the updated marketplace tests pass locally: **81 Node entries**, including the legacy file runners; 38 P3 tests cover explicit legacy access, no fallback, independent definitions, unit preservation, new-year intake, retained history, failure/rollback and NOTHS source discrepancies. Native/API evidence remains private; committed reports expose only aggregates/product comparisons. All **33 desktop/mobile browser follow-up checks passed**, with no browser errors; results and screenshots are in this directory. No August/September source totals were invented, no verified gross bridge was removed, and no production workflow or data changed.

### Latest-main compatibility check

A read-only `git merge-tree` check of latest main `02e2f3c750acaefaebbca733e62efa9cd44910fd` and P3 produced a conflict-free combined tree; no branch was merged. The complete combined tree was exported to an isolated test preview. Initial checks exposed three older-date assumptions in the tests plus the expected changed daily-export hash baseline. The tests now use explicit partial/marketing-date fixtures; a separate `latest-main-exports.sha256` pins the five actual main exports for this isolated run. The original P2 preservation baseline and branch exports remain unchanged. See `latest-main-test-results.txt`; no financial production code or figures were changed to make tests pass.
