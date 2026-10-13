# Isolated Etsy reporting proposal

Prepared from deployed main `08247d4`, reusing the reviewed PR16 Etsy calculations. This branch is for review and separate approval. It does not merge PR16 or change NOTHS financial calculations, Shopify, Ads, Email, LTV:CAC, imported exports or production schedules.

The original ROR Sales components consume Etsy source-validated merchandise sales and eligible Sold Orders. FY26 coverage is retained, with the independently validated August and September 2026 candidate. October is unavailable. Current-year totals containing October withhold net revenue, orders and AOV. Users can explicitly select labelled legacy imported gross; it is never a fallback for missing net. All Stores and NOTHS remain imported gross pending independent reconciliation.

Snapshots contain aggregate monthly/daily figures and source hashes only. Raw customer/order evidence, statements, credentials and accountant reports remain private. The collector/importer are existing reviewed read-only and controlled CSV tools, with no scheduled production collector enabled and no StockHub token management. Native API candidates cannot alone establish Etsy Stats eligibility or NOTHS net sales.

## Validation and refresh

Run `node --test finance/marketplaces/test/*.test.js` plus all existing reporting suites. Each newly imported month requires complete paired Sold Orders/payment CSVs, independent Stats revenue/order controls and native London receipt evidence. Re-import affected closed months when source adjustments occur. Do not present uncovered current periods as verified or convert them to zero.

Proposed active immutable snapshot is `e9f7612f48a3df24b3f4413383ff55cdfed9001b5b8096fcb4b1adbaa3b85788`. Retained FY26 snapshot is `c724cf6a191c0d6183042b0df017a2a8e89ec516e70595021ce3333b7d92be3c`. Their FY26 monthly and daily facts are identical. Snapshot, manifest and historical refresh status must be released together after approval. The status explicitly states `live: false`; this is validated historical reporting, not an automatic current-marketplace feed.

## Release and rollback gates

Before any merge: recheck latest main, require reporting CI, protected-export and Shopify snapshot preservation, source integrity, and desktop/mobile visual acceptance with approved tooling. Browser visual acceptance has not been repeated for this isolated branch. No deployment approval is implied by preparation.

For an approved release, verify the Pages-served Etsy manifest/snapshot/status and all original dashboard tabs, filters, table, contribution and Explorer. Ensure unverified October is unavailable and explicit legacy gross remains accessible. Do not offer a three-channel net total.

For a source-only rollback, use `rollback.js` against an approved isolated staging directory and a retained validated snapshot, then release its matching pointer/status after review. To withdraw the initial Etsy interface integration, revert only its reviewed code commit on latest main, preserving newer exports and existing Shopify/Ads changes. Never reset main, force-push, alter source records or roll back unrelated releases. Failure/rollback/recovery are tested using disposable directories.
