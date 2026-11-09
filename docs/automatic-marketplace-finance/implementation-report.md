# Automatic marketplace pipeline — implementation and validation

Implemented on 9 November 2026 under the owner's instruction to finish automatic collection → existing agreed maths → validation → dashboard publication. PR #25 was separately approved and merged first; its synthetic unvalidated-shipping regression is retained. No StockHub code, operational records, inventory or token lifecycle changes are required.

## Result and scope

Native Etsy/NOTHS financial components are collected through the existing read-only APIs, using encrypted Actions keys and the current Etsy access token read into memory through the already-configured D1 connection. StockHub alone renews OAuth tokens. No credentials, customer information, source order IDs or raw captures are published.

The existing management calculation functions and supported profit estimates are preserved. NOTHS retains the provisional original placed-order-cohort/customer-total definition, without a guessed refund deduction. Etsy merchandise remains original value less discounts, with existing shipping/VAT allocation and no second partial-refund deduction. All Stores unsupported Gross/Total and unsupported profit measures remain withheld. Existing native Shopify calculations, paid attribution, costs and goals are unchanged. The previously hard-coded unavailable goal-progress hint now follows the current Net Sales source coverage.

The daily workflow runs at 04:00 UTC once MARKETPLACE_FINANCE_ENABLED is true. It recollects all retained marketplace history through London yesterday and automatically validates and publishes an immutable snapshot, pointer and matching status. Every run compares the source fields used by reporting against retained independent historical controls. Failures retain last-good facts and publish a warning only. Publication preserves concurrent unrelated exports, protects source/calculation changes and never force-pushes. Pages and the served marketplace bundle are checked before success is reported. Open dashboards poll every 15 minutes.

## Source verification

Read-only credential-backed GitHub run: https://github.com/GrahamROR/ror-dashboard/actions/runs/42650700935 — passed; production files unchanged. All reporting components match 426 accepted Etsy days and 365 NOTHS days. Native coverage reaches 8 November 2026 for both channels. See hosted-verification.json.

Five Etsy native-tax values differ from the historical CSV Sales Tax field, exactly matching the already-documented FY26 residual cases. The native amounts are preserved, explicitly labelled and recorded as separate source-field differences. No revenue balancing or tax deduction was inserted.

Etsy Paid receipts are paid but unshipped. The Stats source includes open and completed purchases; it is not a shipped-orders-only measure. Unpaid/payment-processing receipts remain excluded. Authoritative definitions: https://developer.etsy.com/documentation/essentials/definitions/ and https://help.etsy.com/hc/en-us/articles/360024112734-Where-Can-I-Find-My-Total-Number-of-Sales . The original closed-month CSV validator's narrower status whitelist was not reused as a shipment-based recognition rule for current sales.

## Tests and browser acceptance

Full reporting suite after PR #25: 141 tests, 137 passed, four intentional private-evidence skips, zero failures. New automatic-pipeline checks cover DST bounds, eligibility/refunds, duplicates/incomplete captures, currency/components, historical-control drift, credential expiry without token writes, retries, last-good retention, atomic publication, mixed served bundles and privacy. Dashboard/date/Ads/Insights suites pass; native Shopify reconciliation passes 42 control periods and 130 rows. Protected original exports and Shopify snapshots are unchanged.

Desktop (1440px) and mobile (390px): FY26 All Stores Net Sales remains £398,139.18. The private preview reports current-FY Net Sales £79,554.92 through 8 November, agreeing across KPIs/comparison/channel sums. Three channel views and all six table granularities pass. The current goal shows 15.9% against the unchanged £500,000 goal, independently of the selected page period/basis. Failed-refresh preview retains the values and shows the warning. No page errors or horizontal mobile overflow. See browser-results.json and screenshots.

Claude reviewed the source read-only and the fixes; its final verdict was no remaining concrete blockers. Publication guards, lost-ack handling and served verification were independently read.

## Operations and limits

Routine refreshes need no CSV work or human promotion. A genuine source/control discrepancy or expired upstream connection fails closed and becomes an exception, not a fabricated number. GitHub Actions failures and the dashboard status expose those exceptions. Full-history reads are intentionally bounded; exceeding provider pagination limits is an explicit failure rather than truncation. Keep immutable snapshots, particularly the historical reference, for validation/rollback.

Pause with MARKETPLACE_FINANCE_ENABLED=false, then use the retained source-only rollback flow if necessary; preserve matching pointer/status and all newer unrelated exports. Do not reset main or force-push. The implementation changes no Spark agents; future consumers can use the source/version/coverage metadata of the same deterministic aggregates.
