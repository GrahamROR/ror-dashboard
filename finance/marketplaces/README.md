# Marketplace commercial reporting (P3)

This extends P2's penny/date primitives behind the original ROR Sales components. Shopify's finance modules and production exports are unchanged. There is no finance page, database, operational importer, StockHub change or Xero integration.

## Historical coverage and definitions

Etsy FY26 only is source-validated: complete paired Sold Orders/payment CSVs, independent workbook controls, and a native receipt read covering all statuses. Revenue is Sold Orders `Order Value - Discount Amount`; orders are distinct eligible Sold Orders. Four partial refunds stay in the source calculation; nine cancelled fully refunded payment-only records are excluded. Fees are expenses. Gross basis uses original merchandise for eligible Sold Orders; total basis uses their actual Order Total. Source tax and five £16.51 total residuals are preserved. These are commercial source metrics, not VAT-exclusive accounting turnover.

Native receipt timestamps establish Europe/London daily dates. Eleven date-only CSV rows differ by one day, with no month/year boundary differences. Missing native timestamps or mismatched financial amounts block import. Zero-sales days exist only inside explicitly complete, validated months. Outside coverage, financial revenue/orders/AOV are unavailable, never relabelled imported gross as net. Purchased units stay imported and comparisons use their independent completeness.

NOTHS native gross turnover reconciles in all twelve FY26 months to native item gross plus delivery. Product-report scope, eligible orders, refund allocation/effective dates and native component identities remain unresolved. NOTHS dashboard calculations stay unchanged and imported gross-labelled. All Stores, including per-channel series and contribution, retains the complete legacy gross basis for every channel. No consolidated net total is offered.

## Simple controlled refresh

1. Keep source files and credentials under private, ignored `finance/local-data/`, never commit buyer/order evidence. Obtain complete Sold Orders and Direct Checkout Payments CSVs for each month being added or revised, plus independent Stats revenue and order controls. The supplied FY26 workbook establishes this policy only for FY26. New-year controls must establish eligibility, discount/refund and tax treatment again.
2. Collect native receipts for the matching period using `collect.js`; it makes GET requests only. Credentials are environment variables: `ETSY_SHOP_ID`, `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_ACCESS_TOKEN`; NOTHS uses `NOTHS_TOKEN`. Token management stays external. An expired token fails safely; this repository never refreshes or writes a StockHub token.
3. API candidates cannot auto-promote to verified reporting: their fields alone do not establish future Etsy Stats eligibility or NOTHS native-report scope/refund dates. The collector validates required fields, GBP units, timestamps, count stability, duplicates and bounded pagination. NOTHS explicitly sorts by placed time and checks monotonicity; default activity order is never assumed.
4. Run the paired CSV importer with explicit period controls and the native receipt evidence. It replaces only the declared complete months, preserves untouched validated months, creates a content-addressed immutable aggregate and atomically updates the staging manifest. Files expose aggregate figures and SHA hashes only. Failure keeps the last-good manifest and writes an explicit failed refresh status.
5. Re-run reconciliation and automated/browser acceptance before reviewing each staging promotion. A source change is handled by re-importing affected complete months, not by applying invented deltas to historic orders. During the interim process, review the open month weekly, close/import it after native monthly Stats is available, and recheck the prior two months for late changes. An older reported correction triggers an explicit import of that month. Do not claim older snapshots are live/current merely because recent months refreshed.

Commands (from repository root; ISO end is exclusive):

```sh
node finance/marketplaces/collect.js etsy \
  '2025-08-01T00:00:00+01:00' '2026-08-01T00:00:00+01:00' \
  finance/local-data/etsy-native.json
node finance/marketplaces/collect.js noths \
  '2025-08-01T00:00:00+01:00' '2026-08-01T00:00:00+01:00' \
  finance/local-data/noths-native.json
python3 finance/marketplaces/extract-controls.py WORKBOOK.xlsx \
  finance/local-data/etsy-controls.json
node finance/marketplaces/import-etsy.js SOLD_CSV_DIRECTORY PAYMENT_CSV_DIRECTORY \
  finance/local-data/etsy-controls.json finance/local-data/etsy-native.json \
  finance/marketplaces/staging
node finance/marketplaces/reconcile.js
node --test finance/marketplaces/test/*.test.js
```

File names use `EtsySoldOrdersYYYY-M.csv` and `EtsyDirectCheckoutPaymentsYYYY-M.csv`. A controls file declares `monthly_controls` with complete GBP/London source amounts in pennies and order counts; optional Stats totals compare only the supplied month set. Partial imports with missing evidence fail, rather than guessing zero. The workbook extractor is specific to the supplied FY26 layout; for later periods use newly verified source controls, not this FY26 workbook.

Current live read test collected 24 Etsy and 72 NOTHS receipts/orders for 1–11 October 2026. Both candidates remain private and unpromoted, pending independent new-year source controls. See `native-refresh-validation.json`. This is a functioning read-only collection/controlled import process, not an enabled production schedule. Existing GitHub daily exports and the P2 staging refresh remain untouched; only reporting CI adds marketplace tests. Enabling a production refresh/promotion workflow needs owner approval and separate credential provisioning.

## Release and rollback

P3 is stacked on unmerged P2 (`codex/pr2-canonical-shopify-finance`, commit `00593ec`). Review/merge order is P1 → P2 → P3, with compatibility checks against then-current main and preserving newer daily exports. Owner approval is required for merge, deployment, production workflow activation or financial publication. Before approval, archive private API/source evidence from the local review checkout in an approved durable private location (never the public repository), run CI, verify source hashes and all twelve month controls, check desktop/mobile and retain the prior release revision.

```sh
node finance/marketplaces/rollback.js finance/marketplaces/staging SNAPSHOT_SHA256
```

Rollback checks the retained snapshot hash/schema and changes only the staging pointer; no source orders, StockHub data or original imports are modified. Never run rollback against a deployed directory without approval. To withdraw the P3 interface integration, revert its code commit to the retained P2 release; legacy exports are byte-identical and need no restore/backfill. Failed refreshes automatically retain last-good data and surface a warning. A future approved deployment must publish snapshot, manifest and status together and verify browser integrity/coverage after release.

NOTHS evidence still needed: FY26 product-report order-level drill-down with order IDs, inclusions/exclusions and report date policy; refund/credit export with original order ID, effective date, merchandise/delivery/VAT allocation; platform definitions for discount/gross/net fields and tax-component rounding. Fees remain separate expenses, regardless of how net sales is eventually defined.
