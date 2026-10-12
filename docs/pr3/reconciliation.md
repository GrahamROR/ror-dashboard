# P3 staged marketplace reconciliation

Derived from immutable aggregates, supplied report controls and read-only native API checks. No production records changed.

## Etsy FY26

| Month | Imported gross | Original merchandise | Discounts | Corrected / source Stats revenue | Sold orders | AOV | Difference |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2025-08 | £1,994.65 | £1,994.65 | £65.40 | £1,929.25 | 71 | £27.17 | £0.00 |
| 2025-09 | £1,956.00 | £1,956.00 | £34.19 | £1,921.81 | 64 | £30.03 | £0.00 |
| 2025-10 | £1,309.35 | £1,309.35 | £37.40 | £1,271.95 | 41 | £31.02 | £0.00 |
| 2025-11 | £5,810.20 | £5,654.20 | £719.12 | £4,935.08 | 192 | £25.70 | £0.00 |
| 2025-12 | £6,298.35 | £6,240.40 | £314.21 | £5,926.19 | 216 | £27.44 | £0.00 |
| 2026-01 | £2,655.60 | £2,603.60 | £359.01 | £2,244.59 | 79 | £28.41 | £0.00 |
| 2026-02 | £1,311.95 | £1,311.95 | £14.30 | £1,297.65 | 46 | £28.21 | £0.00 |
| 2026-03 | £1,987.25 | £1,987.25 | £65.95 | £1,921.30 | 59 | £32.56 | £0.00 |
| 2026-04 | £1,591.25 | £1,591.25 | £18.85 | £1,572.40 | 55 | £28.59 | £0.00 |
| 2026-05 | £2,876.40 | £2,876.40 | £50.68 | £2,825.72 | 81 | £34.89 | £0.00 |
| 2026-06 | £2,206.50 | £2,206.50 | £68.25 | £2,138.25 | 68 | £31.44 | £0.00 |
| 2026-07 | £2,672.65 | £2,634.65 | £228.85 | £2,405.80 | 79 | £30.45 | £0.00 |

FY26: **£30,389.99, 1051 orders, £28.92 AOV**. Legacy: £32,670.15 / 1060. Annual and all 12 monthly differences are zero.

The aggregate bridge is £32,670.15 imported gross − £303.95 native cancelled original merchandise − £1,976.21 eligible Sold Orders discounts = £30,389.99. The entire £2,280.16 difference is not attributed to nine refunded payments; their original merchandise is separately established by native receipts. Nine cancelled/payment-only receipts excluded; four partially refunded Sold Orders retained without subtracting refunds again. Fees are expenses. Five order-total residuals total £16.51; preserved, not allocated to tax or net revenue. Tax treatment is source-specific, not asserted VAT-exclusive. Eleven CSV/native date differences corrected using native Europe/London timestamps; no monthly/annual totals change. Future periods have no automatic gross fallback.

## NOTHS FY26 investigation

All 3,786 native orders read, all statuses. The native monthly gross report reconciles exactly in every month to item gross plus delivery. This does not establish net sales or eligible order count.

| Month | Imported / native item gross | Native delivery | Native monthly gross | Difference |
|---|---:|---:|---:|---:|
| 2025-08 | £7,585.59 | £616.79 | £8,202.38 | £0.00 |
| 2025-09 | £8,147.44 | £409.82 | £8,557.26 | £0.00 |
| 2025-10 | £7,489.22 | £363.17 | £7,852.39 | £0.00 |
| 2025-11 | £17,718.92 | £939.28 | £18,658.20 | £0.00 |
| 2025-12 | £23,442.88 | £1,718.77 | £25,161.65 | £0.00 |
| 2026-01 | £12,238.68 | £595.20 | £12,833.88 | £0.00 |
| 2026-02 | £6,477.64 | £241.77 | £6,719.41 | £0.00 |
| 2026-03 | £8,095.79 | £392.99 | £8,488.78 | £0.00 |
| 2026-04 | £5,448.50 | £283.51 | £5,732.01 | £0.00 |
| 2026-05 | £5,772.16 | £241.52 | £6,013.68 | £0.00 |
| 2026-06 | £7,150.20 | £266.56 | £7,416.76 | £0.00 |
| 2026-07 | £6,583.68 | £256.26 | £6,839.94 | £0.00 |

Native item gross £116,150.70 + delivery £6,325.64 = report £122,476.34. Native original order total after source discounts: £120,868.56. Product report £119,478.24 differs from that by £-1,390.32. Dispatched-only order total £119,490.27 is still £12.03 above the product report; no exclusions forced. The subsequent product-level investigation shows every trading product count/units matches the whole cohort, so this near-match does not establish dispatched-only report eligibility. See docs/pr3/current-year/evidence-and-rollout.md.

Native statuses: dispatched 3750; declined 9; refunded 18; expired 8; archived 1. Native refund_total sums £941.81; no refund-posting chronology or merchandise/shipping allocation is established. Source commissions £36,928.35 are separate expenses, not deducted from sales. Native tax components are preserved; 4899 record-field identities differ, with signed aggregate £-46.05 across overlapping fields, not an adjustment to sales.

Required evidence: NOTHS FY26 product-report order-level drill-down linking product rows to order IDs, inclusion/exclusion and date rules; native refund/credit export with effective date, original order ID, item versus delivery amounts and source VAT; clarification of gross/net/discount financial-field definitions and reported component rounding. Repeat these controls for subsequent periods. NOTHS remains labelled imported gross and unreconciled for net reporting.

## All Stores preservation

Legacy revenue £466955.48, 12680 orders, AOV £36.83. KPI, contribution and explorer use all legacy channel values; no gross/net mixing. Consolidated net sales stays unavailable until channel definitions and ongoing sources are compatible.
