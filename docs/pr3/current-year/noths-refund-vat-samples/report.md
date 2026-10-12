# NOTHS refund and VAT samples — 12 October 2026

The three additional statements establish distinct transaction categories that were absent from the initial sample. Read-only native GETs returned **all 188 distinct referenced orders**, with no source writes. **All 187 shopper-payment entries and all 187 commission entries match native order values exactly.** Statement CSVs remain private and untouched; the public audit exposes only aggregate/anonymous source comparisons. The files were moved by the user from Downloads into the dashboard's NOTHS SALES source folder during analysis; their hashes are unchanged.

| Sample | Observed activity | Adjustment | Separate fees/credits | Native corroboration |
|---|---|---|---|---|
| (1) | 15–19 June 2026 | £6.16 deducted on 18 June, labelled NOTHS deemed-supplier VAT reimbursement | Separate from shopper payment and commission | Order placed 17 June; source label `NOTHS (IOSS)`; `noths_vat_liability_amount.gross` = £6.16 |
| (2) | 8–12 June 2026 | £38.00 customer refund on 9 June | £11.40 commission reimbursement; £1.14 refund admin fee | Order placed 7 June, £38.00 original order, £38.00 cumulative refund, state refunded |
| (3) | 7–11 September 2026 | £28.00 customer refund on 11 September | £11.25 partial commission reimbursement; £0.84 refund admin fee | Order placed 2 September, £32.99 original total, £28.00 original merchandise, £4.99 original delivery, £28.00 cumulative refund; state still dispatched |

The June refund causes a **£27.74 settlement outflow**, but the customer-sales reversal is **£38.00**, not £27.74. The September refund causes a **£17.59 settlement outflow**, but the customer refund is **£28.00**, not £17.59. Fees and fee reimbursements are separate settlement categories and must not be netted into customer refund revenue. These sample arithmetic checks do not define a complete annual net-sales series.

September's refund equals original merchandise while £4.99 delivery remains outside that refund amount. This is consistent with a merchandise-only refund for this particular order; the CSV does not explicitly allocate refund lines and we do not generalise to every refund. It is a FY27 order/refund, not part of the FY26 total. Dispatched status demonstrably does not imply “unrefunded”. API `updated_at` is not a substitute for the independently recorded statement refund date.

The VAT deduction matches the exact native amount for the individual IOSS-labelled order. The source contains merchandise VAT £4.86 and delivery VAT £1.30, totalling £6.16. This corroborates the deduction category, not a universal VAT rate or a blanket subtraction from commercial gross turnover. The partner net/gross/VAT fields need separate treatment from product revenue; no accounting turnover definition is promoted.

## Remaining discrepancies and limits

- September's £11.25 commission credit is **£0.51 below** the captured native item-commission gross of £11.76. The native item/delivery commission totals also differ by one penny from native overall commission. The credit is preserved as reported, not forced into a assumed rate or item allocation.
- Exported-amount sums leave closing-balance residuals of **£0.23**, **£0.1025** and **£0.0925** respectively. Two opening balances have four decimal places; the diagnostic preserves all source precision. Export rounding/internal precision is possible but not verified. Closing balances/payouts are not sales controls.
- These samples establish two customer refund events and one VAT-liability deduction. They do not provide a complete FY26 ledger, all historical refund dates/allocation, or explain the existing **£6.27** cumulative refund/order-total difference. No missing events are invented.
- Source CSVs lack a declared currency, statement period and timezone. Matched API amounts are GBP; order placement is converted to Europe/London. The statement event timezone still requires source confirmation. No silent date conversion is performed.

## Efficient next step

**No more ad hoc weekly samples or year-long manual downloads are requested.** The format is now proven useful. Prefer a consolidated order-linked transaction CSV with these same labelled categories for FY26 and later refunds against its orders. Its required fields are source transaction ID where available, original order ID, posting/effective timestamp and timezone, currency, signed amount and transaction type, with customer refunds separated from commission/admin/VAT/platform-funding entries. Refund item/delivery/VAT allocation is needed where available. Confirm export amount/balance precision.

The screenshot proves an individual statement Download option; bulk export or read-only automated portal acquisition has not been verified. Partner Support can supply a consolidated ledger or confirm bulk export access. If neither exists, assess approved read-only statement acquisition, rather than asking the user to download 52 files. We have not contacted NOTHS or enabled portal automation.

A small reusable **investigation-only** `noths-statements.js` now parses the known categories, retains customer refunds separately from fees/credits/VAT/transfers, flags unknown or repeated rows and preserves four-decimal opening balances. It is not connected to dashboard revenue or a production workflow. Five synthetic automated checks cover category separation, source precision, missing/invalid data and unknown/repeated entries. This extends the existing marketplace source-validation work without introducing another reporting interface, database or operational refund system.

The original FY26 gross-turnover bridge remains exact and unchanged at **£122,476.34**. NOTHS net sales/consolidated net remain withheld. Shopify, Etsy snapshots, active manifests, protected exports, dashboard UI, StockHub and Xero are unchanged. All changes remain on PR16; no merge, deployment or production write.
