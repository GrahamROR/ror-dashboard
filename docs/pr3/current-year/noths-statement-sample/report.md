# NOTHS weekly statement sample — 12 October 2026

The user supplied one `statement.csv` from the July/August boundary. It is useful, machine-readable supporting evidence; **no year of manual weekly downloads is requested**. It is not a verified net-sales source or a complete FY26 refund ledger. Dashboard figures, code, active financial snapshots, StockHub and Xero remain unchanged.

## Observed scope and exact joins

The CSV has 131 data rows, including an opening balance and transfer. Actual activity dates are **27–31 July 2026**; it contains no August-dated entries. The CSV does not declare statement boundaries, currency or timezone, so no August zero-sales/completeness claim is made. It may belong to a week spanning August, but that period cannot be verified from these columns alone.

- 61 shopper-payment entries sum **£1,870.52**.
- 61 commission entries sum **−£572.30**.
- Seven NOTHS-funded discount entries sum **£20.37**.
- One bank transfer is **−£943.25**; it is a settlement movement, not a sales reversal.

All 61 order identifiers match the retained native capture collected on 12 October. Every shopper payment equals the native order's `order_total`; every commission matches `financials.commission.gross`. For all 61, shopper payment plus separately credited NOTHS funding equals `financials.purchase_subtotal.gross`. Native money fields confirm GBP; the CSV itself has no currency column.

Linked order placement dates run **24–31 July in Europe/London**, while statement activity is posted 27–31 July. Seventeen of the linked orders were placed before the first statement date. This directly establishes why posted statement rows must be joined to source orders rather than used as order-date weekly/monthly turnover. Refunds would need both their actual event date and original order relationship.

The funded-discount credits demonstrate that customer payments and platform-funded credits are separate statement categories. They must not be silently treated as merchant-funded discounts or expenses. This sample supports the API/ledger joins; it does not independently define annual eligible orders, VAT-exclusive turnover or refund recognition.

## Discrepancies retained

One order's native purchase subtotal is **£28.86**, matching shopper payment £25.51 plus platform funding £3.35. Its native item gross £27.16 plus delivery £1.07 equals **£28.23**: a **£0.63 component/subtotal difference**. That exception is present in the source fields and is not adjusted away or attributed to VAT/postage without explanation.

The opening CSV balance is **£943.245**, while transaction amounts are expressed to two decimals. Adding all exported amounts to that exact opening produces **£1,318.585**, versus the reported final balance **£1,318.75**: an unexplained **£0.165** residual. With the opening rounded to pennies, the apparent gap is £0.16. Internal precision/export rounding may contribute, but the platform's policy is not established. The displayed payout/balance is not a net-sales control.

There are **no refund or credit entries in this sample**, and the matched orders show no cumulative refunds. This says nothing about other weeks or FY26 refunds. It cannot resolve the already documented £6.27 refund/order-total gap.

## Minimum remaining evidence and efficient collection

Only **one sample containing an actual customer refund or a linked credit note** is needed next, if readily available. A NOTHS-funded promotion row is not a refund. We need to establish the ledger's event labels, signed amounts, original order link and refund/commission-credit separation before considering wider collection. Do not manually download the entire year.

This CSV format is suitable for automatic parsing/joining. Whether the authenticated portal supports a bulk date-range download or automated read-only acquisition is not yet verified. The visible statement screenshot establishes a per-statement Download button, not a bulk export/API. Once the refund sample is checked, prefer a single consolidated transaction ledger from existing Reports/Partner Support. If only weekly downloads exist, assess read-only portal automation first rather than assigning 52 manual downloads to the user. No portal automation, support message or new operational process was enabled in this follow-up.

Request to Partner Support if needed: “Please provide one consolidated transaction CSV for 1 August 2025–31 July 2026, plus later refunds/credits against those orders through extraction, with the same dated order-linked categories as the weekly statement export. Include customer refunds and separately identified commission/fee credits and platform-funded discounts; confirm statement timezone, amount/balance precision and reporting dates. Please explain source component/subtotal differences and any refund exceeding its original order total.”

The verified native FY26 **£116,150.70 item gross + £6,325.64 delivery = £122,476.34 monthly gross-turnover bridge** remains unchanged. The annual product/report/refund questions remain open. No NOTHS net-sales or consolidated net figure is promoted.

`analysis.json` records source hashes, category aggregates, exact 61-order match results and residuals, without private order IDs or customer information. The source CSV/private join work remains unmodified and outside Git. No executable dashboard changes were made; existing tests remain valid for unchanged code.
