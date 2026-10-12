# Independent Etsy promotion and rollback

No promotion performed. This plan is independent of NOTHS net reconciliation and of Shopify's new production-writer gate, while retaining the stacked PR code dependency.

## Accepted evidence retained

- Active FY26 snapshot/hash: `c724cf6a191c0d6183042b0df017a2a8e89ec516e70595021ce3333b7d92be3c`, under `finance/marketplaces/staging`. All 12 monthly and daily records remain exactly preserved; FY26 £30,389.99 / 1,051 / £28.92.
- August/September review-only candidate/hash: `e9f7612f48a3df24b3f4413383ff55cdfed9001b5b8096fcb4b1adbaa3b85788`, under `finance/marketplaces/candidates/etsy-aug-sep-2026`. It contains all 14 months and every original FY26 record unchanged. August £3,642.52 / 125 / £29.14; September £1,371.20 / 52 / £26.37.
- Source CSVs and independent Stats captures/hashes remain private. Native receipt reads corroborate financial values and London dates. Fees/zero reported tax/refund eligibility remain source-specific; no VAT-exclusive accounting turnover claim.

## Approval-gated promotion

1. Retain exact existing production code revision, Etsy manifest/status, old snapshot and source/audit hashes. Review P3 UI/source changes and accept the ongoing coverage policy; P1/P2 must be compatible, with any Shopify publication approval treated separately. Do not bundle a NOTHS net/consolidated-net calculation.
2. Revalidate the candidate hash/schema, paired source controls and timestamps, FY26 exact equality, August/September native Stats totals and eligible orders, all financial bases and same-date component totals. Replay import/failure/rollback in a disposable copy; do not re-import into production or rewrite old facts.
3. After approval, copy the reviewed immutable candidate file into the **existing** `finance/marketplaces/staging/snapshots` path and publish a matching manifest/status with the reviewed UI/calculation code as one Git/Pages release. The path name does not create a separate dashboard. Preserve the old snapshot and all original imported exports. Do not enable a marketplace production collector/schedule implicitly.
4. Verify the Pages revision and hash, all original ROR features and Shopify Growth, August/September cards/table/contribution/Explorer and September same-definition MoM/YoY. Confirm missing imported units remain independently labelled. All Stores and NOTHS keep legacy figures.
5. Verify **October remains unavailable**. Full Current FY through October, This Month, Last 30 and Last 7 have no verified net totals until October coverage exists. Covered August/September rows can show independently; overall incomplete totals/comparisons remain withheld. Imported gross is available only via explicit labelled legacy selection; changing to legacy applies the same definition to both comparison periods.
6. Adopt the existing controlled **closed-month** refresh policy: new paired Etsy Sold Orders + Payments exports, independent Stats controls and native London receipts; late changes require new source evidence and a reviewed immutable candidate. Record source capture/import date and missing/failed periods. October MTD/daily promotion is not implemented or approved; do not imply this is live fully verified finance. No arbitrary gross/net cutover or estimated daily net is permitted.

## Independent rollback

Pause any newly approved Etsy publication step. Restore the exact retained compatible code revision and Etsy manifest/status to the retained FY26 pointer as one release; keep both immutable snapshots and private evidence. Shopify's manifest, NOTHS figures, All Stores imported exports, StockHub and Xero are not rollback targets. Confirm FY26 values and original features still work, and August/September return to unavailable net rather than silently imported gross. Explicit legacy selection remains available. Diagnose in private staging before repeating promotion. This is a release plan, not a performed production rollback.
