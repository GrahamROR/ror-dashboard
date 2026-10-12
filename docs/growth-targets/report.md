# Growth targets and reporting fixes

Based on latest main 95608afe717e7342b4e8e4889b6e60d158b34e10. No P3 work, merge, deployment or production activation.

| Month | Original full-month target | Corrected full-month target |
|---|---:|---:|
| Aug | £37,000.00 | £38,541.67 |
| Sep | £33,500.00 | £34,895.84 |
| Oct | £30,000.00 | £31,250.00 |
| Nov | £58,500.00 | £60,937.50 |
| Dec | £71,000.00 | £73,958.33 |
| Jan | £53,000.00 | £55,208.33 |
| Feb | £31,500.00 | £32,812.50 |
| Mar | £38,500.00 | £40,104.17 |
| Apr | £28,000.00 | £29,166.67 |
| May | £33,500.00 | £34,895.83 |
| Jun | £35,000.00 | £36,458.33 |
| Jul | £30,500.00 | £31,770.83 |
| **Annual** | **£480,000.00** | **£500,000.00** |

FY26 verified Total Sales remain **£313,437.06**. Variance changes from −£166,562.94 to **−£186,562.94**: a **£186,562.94 shortfall** against the unchanged £500k goal.

FY27 through 11 October: August £38,541.67 + September £34,895.84 + October £31,250.00 × 11/31, rounded to £11,088.71 = **£84,526.22**. The former target was £100,500, including all of October. Verified Total Sales are £45,693.26; comparable variance is **−£38,832.96**. Full-month October planning target remains £31,250.00.

## Calculation and presentation

Normalise the original integer seasonal proportions by their sum of 960, preserving August–July distribution at 100%. Allocate monthly targets with the largest-remainder method in integer pennies; ties follow financial-year month order. The monthly penny sum equals any selected annual goal. Full months receive full targets, the current month receives elapsed verified days / actual days in that month, and future months contribute zero. Leap years and London financial-year/date boundaries are handled.

Current-year financial actuals and targets share a verified cutoff, capped at London yesterday. Older coverage is explicitly dated and warned. Missing figures/days withhold comparisons instead of becoming zero. Historical closed years retain the full annual planning target even when financial actuals are unavailable. The reviewed FY27 financial benchmarks are conditional historical checks against that original snapshot, never runtime restrictions on newer verified data.

The existing modeller is labelled **Shopify Total Sales YTD — Goal Basis**. Total Sales remains its fixed revenue/AOV basis. The selected gross/net/total actual appears in a small line in the same header. Sliders, locks and the £500k default remain. Forecast arithmetic is preserved; projection-to-actual comparison is withheld when current legacy sessions and financial actual have different or unavailable cutoffs. The seasonal peak correctly identifies December; daily planning uses the financial year's actual length.

The original nine-column Monthly table exposes Total Sales actual as a small second line beneath selected gross/net revenue. Targets distinguish comparable elapsed-month amounts from full-month plans. **Total Sales variance vs target** uses signed integer-penny subtraction. The existing chart is explicitly a full-month planning comparison; partial-month hover labels identify that distinction, and unavailable/future actuals are not shown as zero.

Legacy marketing update timestamps are distinguished from financial coverage, with London date/time formatting. Existing failure/overdue warnings remain. Yesterday shows native financial revenue/orders/AOV independently of legacy capture or selected FY. Older/missing marketing and cost data is labelled and withheld for that day. Stale finance suppresses automated performance conclusions. Ads attribution, Klaviyo and margin estimation methodologies remain unchanged.

## Validation

[Automated results](automated-tests.txt) cover the original financial, reporting, date, Ads and insights suites plus new allocation, pacing, calendar/London, basis-switching, compatible variance, monthly reconciliation, missing-data and preservation regressions. [Browser observations](browser-results.json) cover desktop/mobile FY26 Overview in all bases, FY26 Monthly, FY27 Overview/October MTD, Yesterday, original tabs, sliders and ROR Sales preservation. Mobile page width remains 386px within the 390px viewport; the existing table scrolling remains available.

The original export-hash test initially failed because its default P2 baseline predates newer exports already on main. This PR records the actual latest-main baseline and supplies the test's existing explicit baseline override in **test CI only**. The historical P2 baseline remains intact. A new missing-day fixture initially used `date` instead of the source field `day`; corrected, then the full suite passed.

Preview reloads occasionally produced missing-script globals in the browser automation environment. Fresh contexts loaded successfully and completed functional checks had no errors. No production code workaround was introduced for these preview failures.

[Export hashes](main-exports.sha256) and [financial artifact hashes](financial-data.sha256) confirm byte-identical preservation of all five exports, immutable snapshots, manifest and status. Monthly gross/net/total/orders reconcile to annual native controls. AOV uses appropriate whole-period totals or the native period metric, never sums monthly AOV. The existing 130-row financial reconciliation regenerates without a diff. ROR Sales retains Shopify FY26 net £247,999.66 / 7,832; All Stores remains legacy gross £466,955.48 / 12,680 / £36.83.

Different-cutoff Yesterday screenshots use an explicitly simulated older **marketing date only** in an isolated copy, with the original financial snapshot bytes preserved. The stale-data screenshot uses a retained original 7 October snapshot, not invented amounts. No StockHub, Xero, Etsy, NOTHS or PR16 changes were made. No production schedules or finance activation were changed.

## Screenshots and rollback

Desktop: [FY26 Net](screenshots/fy26-overview-net_sales.png), [Gross](screenshots/fy26-overview-gross_sales.png), [Total](screenshots/fy26-overview-total_sales.png), [FY26 Monthly](screenshots/fy26-monthly.png), [FY27 Overview](screenshots/fy27-overview.png), [FY27 Monthly](screenshots/fy27-monthly.png), [Yesterday](screenshots/yesterday-desktop.png), [different-cutoff Yesterday](screenshots/yesterday-cutoff-mismatch-desktop.png). Corresponding mobile captures and stale coverage evidence are in [screenshots/](screenshots/).

Review and merge only after approval. No workflow activation is required. Rollback is a narrowly scoped code revert of this feature, retaining newer exports and every financial snapshot/pointer. No known calculation issue remains; missing, stale and failed financial sources retain explicit warnings and withheld comparisons.
