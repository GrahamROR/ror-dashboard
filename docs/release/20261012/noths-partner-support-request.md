# NOTHS consolidated ledger request

**Status: Sent to NOTHS Partner Support — 12 October 2026 (confirmed by the user). Awaiting a response.** This replaces requests for manual weekly statement downloads.

Subject: Consolidated order-linked financial transaction ledger and independent sales controls — Rock On Ruby FY26

Please provide one CSV (or a documented supported read-only bulk API/export) containing:

1. All financial transactions posted **1 August 2025–31 July 2026**, including those referring to orders placed outside that period.
2. All subsequent adjustments through **12 October 2026 / extraction date** affecting orders placed 1 August 2025–31 July 2026. Please include the original payment/transaction relationship so both order-cohort and event-date reporting can be reconciled without moving events to order dates. Include cancellation/reversal corrections and late credits/refunds.

Required columns: unique source transaction/event ID (where available), original partner order ID, original order placement timestamp/timezone, independent posting/effective timestamp/timezone, currency, signed amount, transaction type, statement/report ID, related refund/credit/fee reference, and merchandise/delivery/VAT allocation where available. Preserve the actual timestamps and indicate both posting and effective dates if different. We cannot infer a refund date from order status or updated_at.

Please keep **customer refunds, original shopper payments, commission charges, commission reimbursements, refund admin fees, NOTHS-funded discounts, VAT/IOSS deemed-supplier deductions, and settlement/bank transfers** as separate labelled transaction types, matching the existing statement CSV descriptions. Clarify any merchant-funded discount separately from NOTHS-funded credits, refund allocation and original/corrected amounts. Please include all statuses/products, not only Available or dispatched.

We also need an **independent NOTHS monthly/FY26 reporting control** for commercial merchandise sales and customer refunds, with exact definitions: date basis, eligible orders/cancellations, refunds, discounts and funding, delivery inclusion, and actual tax treatment. If no native net-sales report exists, supply independent gross/discount/customer-refund controls and explain their definitions; a payout or closing settlement balance is not a net-sales control. Confirm transaction export completeness/counts and amount/balance precision.

Our original item gross £116,150.70 plus delivery £6,325.64 already reconciles to native monthly gross £122,476.34. We are not seeking to force another definition to that total. Please explain the **£6.27** difference between captured cumulative refunds (£822.84 for refunded-state orders) and those original order totals (£816.57), supported by individual event allocation. Commission, admin fees and tax credits must not be assumed to explain it without evidence. A September sample also has a £11.25 commission credit against a £11.76 source item-commission amount; please confirm the credit basis.

If this data cannot be provided as a consolidated export, please confirm whether the existing statement CSVs have a supported bulk date-range export, a documented read-only endpoint, or whether authenticated read-only UI download automation is permitted. Provide access/rate-limit/retention guidance and a completeness control. We do not need new operational integrations or database writes.
