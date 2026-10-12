# Etsy August–September 2026 evidence validation

The user supplied both paired month exports and independent Etsy Stats captures on 12 October 2026. This adds a **separate review-only candidate**, not a production deployment or a change to the active P3 staging manifest. The candidate is available under `finance/marketplaces/candidates/etsy-aug-sep-2026`; its immutable snapshot retains the original FY26 history exactly.

| Month | Original merchandise | Discounts | Calculated Stats merchandise sales | Independent Stats revenue | Eligible orders / Stats orders | AOV | Difference |
|---|---:|---:|---:|---:|---:|---:|---:|
| August 2026 | £4,131.50 | £488.98 | £3,642.52 | £3,642.52 | 125 / 125 | £29.14 | £0.00 / 0 orders |
| September 2026 | £1,406.60 | £35.40 | £1,371.20 | £1,371.20 | 52 / 52 | £26.37 | £0.00 / 0 orders |

August shipping is £87.66 and source order total £3,730.18. September shipping is £40.77 and total £1,411.97. Both tax columns are £0.00; this preserves the source values and does not establish VAT-exclusive accounting turnover. Paired payment gross equals the original order totals. Fees (£174.22 / £66.91) are retained as expenses, not subtracted from sales. No source payment refunds or order-total residuals occur in these supplied months. Later changes still require a new controlled import.

All 177 native receipts are Completed and paid. IDs, original merchandise, discounts and totals match the paired CSVs exactly. No duplicate order/payment IDs, extra unpaired native receipts, missing financial fields, unsupported currencies or exchanges were accepted. Full native collection spans 1 August to 1 October exclusive at Europe/London midnight. The screenshots show full-month dates, GBP and independent revenue/orders; their timezone setting is **not visible**. The observed monthly eligibility/totals reconcile exactly against London receipt scope; no platform timezone setting is inferred. Daily reporting uses native London timestamps rather than assuming the CSV calendar date timezone.

Source files are untouched and private. `independent-stats-controls.json` records transcribed screenshot controls, evidence hashes and review scope. `validation.json` includes source CSV hashes and aggregate audit fields. No buyer/address/order identifiers or screenshots of the user's desktop are committed.

## Original imported figures versus the candidate

Using latest main's 12 October export, the legacy Etsy import reports August £4,131.50 / 125 orders / £33.05 gross AOV, with two absent day entries. September reports £1,165.95 / 41 orders / £28.44 gross AOV, with nine absent day entries. These are recorded imported subtotals, not complete native revenue. The validated paired September evidence establishes 52 orders; the cause of the 11-order import gap is not inferred and StockHub is not backfilled or changed.

Users retain explicit legacy access. The candidate makes August/September financial sections available in the original UI with independent source definitions. It **does not** make the full Current FY, This Month, Last 30 Days or Last 7 Days net total available on 12 October: those periods include unverified October. The comparison table can show covered August/September rows while withholding the incomplete overall total. No gross substitution or zero-filled October is introduced. Active release data stays unchanged pending review/publication approval.

## Validation and release

All 12 FY26 month objects and daily records compare exactly with the original snapshot. Failed controls leave the last-good pointer intact; rollback to FY26 and restoration to the new candidate return exact snapshots; repeat import yields the same immutable hash. Eight additional browser checks pass in the isolated latest-main preview, covering September bases, monthly rows and all four October coverage gates; no browser errors. Three new automated cases exercise both actual months across KPIs/table/contribution/Explorer and preserved FY26/legacy coverage. Full branch results: 84 passed, zero failed. Latest-main preview with the active release manifest preserved: 82 passed, two expected private-evidence skips, zero failed.

Promote this candidate only after review, preserving both snapshots and the active code revision as rollback inputs. No automatic Etsy promotion or October MTD process has been enabled. Future closed months need new paired exports, independent Stats controls and native read evidence through the same validation gate. NOTHS net/consolidated net remain unreconciled; prior NOTHS evidence requests and the independent P1/P2 rollout plan still apply. StockHub, Xero, production exports and Shopify financial snapshots were not modified.
