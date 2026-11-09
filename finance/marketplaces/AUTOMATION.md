# Automatic marketplace financial reporting

The automatic pipeline reads native Etsy/NOTHS financial components and feeds the unchanged management maths in `finance/management.js`. The owner authorised completing this path on 9 November 2026. Routine refreshes require no CSV downloads, manual imports or per-run approval.

`scripts/refresh-marketplace-finance.js` runs daily at **04:00 UTC** through `.github/workflows/marketplace-finance-refresh.yml`, once `MARKETPLACE_FINANCE_ENABLED=true`. It recollects each channel from the beginning of retained financial history through yesterday in Europe/London, including closed periods. Verification-only dispatches cannot publish. Publication requires an enabled main-branch workflow context.

## Source access and calculations

- Reuses the existing read-only D1 connection and the current Etsy access token in memory. StockHub owns OAuth renewal; this pipeline never refreshes tokens or writes its token table.
- Existing Etsy app keys and NOTHS token use encrypted Actions secrets: `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `NOTHS_TOKEN`. Credentials, buyer details, raw captures and native order IDs never enter the repository, artifacts or logs.
- Marketplace requests are GET-only. No StockHub operational, source-code, schema, inventory or Brain changes are needed.
- Etsy merchandise is `total_price - discount_amt`, plus native shipping for management revenue. Paid unshipped, completed and partially refunded receipts are eligible. Unpaid receipts and fully refunded cancellations are excluded. Fees and partial refunds are not deducted again.
- NOTHS retains original customer totals and placed-order cohort counts. No cumulative refund deduction or invented refund dates.
- Existing VAT allocation/rounding is unchanged: Etsy merchandise plus shipping / 1.20; NOTHS customer totals / 1.20; Shopify keeps native treatment. Combined Net Sales stays provisional. Unsupported combined Gross/Total remains withheld.
- Existing supported profit estimates and cost coverage are unchanged. No marketplace/All Stores profit is inferred from missing cost data.

Etsy documentation: [Stats revenue](https://help.etsy.com/hc/en-us/articles/360016388633-How-Is-Revenue-in-My-Shop-Stats-Calculated), [read-only payment/ledger APIs](https://developer.etsy.com/documentation/tutorials/payments/).

## Automatic checks and provenance

Each run validates complete London-day bounds, stable/exhausted pagination, unique orders, GBP penny fields, source eligibility, component/count identities, contiguous days and non-regressing coverage. Rate limits/transient provider responses have bounded retries.

The immutable historical reference is `a461901ae78b160064be86eaade0ddce385942245dd3d26b1dcc227081ec2804`: 426 Etsy days through September 2026 and 365 NOTHS days through July 2026. Every refresh recomputes **all source fields used by the agreed reporting maths** against those accepted controls, including shipping/counts. A mismatch blocks promotion; it is never balanced away. Newer periods are recomputed automatically, including later changes to their receipts.

Etsy native `total_tax_cost` and historical CSV `Sales Tax` differ on five previously documented FY26 residual cases. Native tax is preserved verbatim with an explicit `tax_definition`; differences are separately recorded in `automatic_policy.source_field_differences`. They are not deducted from or injected into revenue. Original snapshots stay immutable. Historical CSV-proposal regression cases use their frozen fixture rather than assuming a live feed always lacks October.

Snapshots contain daily/monthly aggregates, source capture hashes, calculation version, coverage and validation evidence. They contain no native order IDs or credentials. Later consumers such as Spark can use these traceable deterministic outputs; no agent invents financial values.

## Publication, failures and rollback

The marketplace publisher prepares snapshot, manifest and matching status together, using the existing fast-forward owned-path publisher. It guards source pointers and producer/calculation code, preserves concurrent unrelated exports and never force-pushes. Integrity, coverage and reporting controls are rechecked before successful publication.

Failed reads, expired connections, incomplete captures and control mismatches retain the last-good manifest/facts and publish a safe warning only. The dashboard keeps covered figures visible and polls marketplace data every 15 minutes. Publication is followed by Pages build and served marketplace manifest/snapshot/status verification.

Pause publication with `MARKETPLACE_FINANCE_ENABLED=false`. Use retained immutable snapshots for the existing source-only rollback flow, restoring matching pointer/status together and preserving newer unrelated exports. Do not reset main or force-push. Verify the served dashboard before declaring recovery.

## Historical tools and release validation

The CSV import/control tools retain their original evidence gates for historical investigations; they are not the scheduled mechanism. Raw evidence stays private. All original snapshots are retained.

Run the full reporting suite and `node --test finance/marketplaces/test/automatic.test.js`. Before activation, require a credential-backed read-only verification, desktop/mobile acceptance and served-bundle verification of the first publication.
