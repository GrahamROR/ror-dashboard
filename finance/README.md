# Shared Shopify finance behind the existing dashboards

The original Shopify Growth and ROR Sales applications remain the only interface. `index.html` renders their existing components; `?finance=staging` has no routing effect. There is no finance navigation, replacement application or link to an original application. The small Net Sales / Gross Sales / Total Sales selectors share state. The default is proposed net merchandise sales, without claiming VAT-exclusive accounting turnover. The source's tax treatment and native AOV precision are preserved.

`integration.js` adapts the verified contract to existing KPI, monthly, product, yesterday, comparison, contribution and explorer components. `loader.js` verifies a shared immutable snapshot against its manifest SHA-256. Missing or failed sources display unavailable finance while retaining the original tabs and nonfinancial features. Units retain the original imported calculation and coverage status. Etsy and NOTHS retain their imported amounts; combined revenue/AOV and stacked revenue/share views remain unavailable until their bases are reconciled. Separate channel amounts and charts remain available.

Existing annual targets and forecast sliders stay on Total Sales, with the same targets. The model uses total sales per eligible order to project compatible Total Sales. Shopify native AOV remains an independently reported metric; selected-basis sales per order and Net AOV remain separate. Ads platform spend, conversions, conversion value and attribution calculations are unchanged. Only its Shopify actual-order comparison now uses canonical eligible orders for the exact selected interval; sessions/conversion retain the existing monthly source.

## Validation and refresh

- `contract.js`: signed integer-penny financial measures, inclusive London reporting dates, missing-day detection, native orders, independent native AOV, calculated net AOV and product reconciliation.
- `build-staging.js`: independently queried monthly/FY controls, product totals, source identity, duplicates, truncation/row-cap detection and provenance. Same evidence replays deterministically.
- `refresh.js`: existing Shopify client credentials, full retained history partitioned by calendar year, London yesterday cutoff, independent native monthly/FY controls, atomic publication only after validation. Late refunds and historical adjustments produce a new immutable snapshot. Failed imports retain the last good pointer and record failure status. Row caps fail closed.
- `scripts/fetch-data.js --finance-staging`: staged financial path through the existing fetch entry point. Without this flag, the existing production fetch behavior is unchanged.
- `.github/workflows/finance-staging-refresh.yml`: manual staging-only candidate using existing Shopify secrets and read-only GitHub permissions. Publishes review artifacts only, without committing exports or deploying. No new production schedule is enabled.
- `reconcile.js`: reproducible original/corrected/native report; supplied benchmarks are comparisons only.
- `rollback.js`: validate and atomically restore a retained snapshot, preserving both versions.

```sh
# Secure environment: existing SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET,
# or SHOPIFY_DOMAIN and SHOPIFY_ACCESS_TOKEN. Never put credentials in source/UI.
node scripts/fetch-data.js --finance-staging
# Replay an independently captured source without contacting Shopify:
node scripts/fetch-data.js --finance-staging --from-capture finance/staging/source
node finance/reconcile.js
node --test finance/test/*.test.js
node finance/rollback.js EXISTING_64_CHARACTER_SNAPSHOT_ID
```

The current snapshot contains fresh connected read-only source evidence captured 8 October 2026, through 7 October, with 44 native controls. A previous snapshot is retained. Private captures and order-ID reconciliation are gitignored and archived separately; public snapshots contain aggregates and hashes only. Connected transport did not expose its API version or source-side last-update timestamp; retrieval time is recorded without claiming it is source update time. Partitioned direct Admin transport uses API 2026-10 and is mock-tested end-to-end, including cross-year controls. The actual refresh entry point was replay-tested against fresh connected source; a live GitHub secret-backed run is not claimed.

Exact native AOV is available for captured source periods. Arbitrary custom intervals retain correct additive sales, orders and net/selected-basis AOV; native AOV is unavailable until an exact native query is captured. Never average monthly AOV to invent Shopify's period AOV.

## Review and release

Production exports, workflows/schedules, attribution, Etsy/NOTHS data/calculations and StockHub code/data remain unchanged. No Xero integration exists. Approval is required before merge, deployment, production financial publication or enabling a production canonical refresh. A future approved rollout must publish one shared validated manifest and retain its predecessor for rollback; full-history refresh must continue to cover historical adjustments.

Automated cases run in `.github/workflows/finance-tests.yml`; raw evidence replay/validation cases run locally and skip in CI if private captures are absent. Existing suites cover ROR calculations/reporting/P1 selectors, Ads and insights. `finance/test/browser-check.js` exercises both original interfaces, all financial bases, all 99 preset-selector combinations, goals/sliders, charts, mobile layouts and source errors, with paired P1/P2 screenshots.

Use `shasum -a 256 -c docs/pr2/production-data.sha256` to verify preserved exports. Never silently replace this baseline.
