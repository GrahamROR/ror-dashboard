# PR15 review follow-up — 12 October 2026

All Stores retains legacy imported gross revenue, imported orders, AOV, contribution and explorer figures for every store, including Shopify. The Shopify-only net/gross/total selector does not change these consolidated legacy figures. Labels state **pending P3, not reconciled net sales**. Donut/bar/stacked contribution and all five separate-series explorer charts remain available. Shares are of recorded imported subtotals, with coverage warnings; missing channel amounts are never manufactured and incomplete coverage still suppresses growth comparisons.

FY26 preserved All Stores: revenue £466,955.48; imported orders 12,680; imported gross AOV £36.83; purchased units 17,671. Contribution: Shopify £318,134.63 (68.1%), NOTHS £116,150.70 (24.9%), Etsy £32,670.15 (7.0%). The import has 49 absent day/channel observations, so these remain recorded subtotals with unverified coverage rather than claims of complete reconciled reporting. No Etsy/NOTHS or legacy financial records/calculations were changed.

## Real GitHub staging refresh

[Successful credential-backed run 38226860648](https://github.com/GrahamROR/ror-dashboard/actions/runs/38226860648), source branch commit `c5391fbd289db953c7cccf72a6cdd4d862f4f709`:

- Uses GitHub Actions' existing masked Shopify client credentials, real OAuth and Admin API 2026-10. No local credentials or connected-tool replay substitutes for this run.
- Reporting coverage: 2024-01-01 through **2026-10-11**, Europe/London, GBP, verified Shopify store.
- 1,015 daily facts, 41 independently queried monthly/calendar/FY controls, reconciled product totals.
- Snapshot `dfd6416590ad2cd7346584d3d46db8afe8552a424e372e58908ae65814e12ff1`; file SHA256 `60304d0ae66356c251cdaf0a68d49770f838e2677f6593a468f20f2e5bbd8dc6`.
- Downloaded artifact SHA256 independently verified: `02b13f05596059cfcc407ba01a5dccd97d36bda452806f84d64456434e1932da`.
- All 1,011 previously captured days are unchanged across eight additive metrics and native daily AOV. Four new days add 49 eligible orders and £1,390.30 net merchandise sales. See [history comparison](refresh-history-comparison-20261012.json).
- FY26 gross £276,221.01; net £247,999.66; total £313,437.06; eligible orders 7,832; native AOV £32.22. The frozen-July staging correction remains £15,416.27 total / £11,619.67 net / 445 orders. No benchmark enters the transformation.
- GitHub passed native-control validation, rollback to the previous immutable snapshot, forward restoration, immutable-file checks and protected-export checks. Rollback is performed in an isolated copy, leaving the real staging pointer and every historical snapshot intact. The same downloaded artifact was independently checked locally.

[Native and rollback evidence](github-refresh-validation-20261012.json), [original/corrected/native reconciliation](reconciliation.md), [machine-readable financial rows](reconciliation.json).

The first [real run 38226532016](https://github.com/GrahamROR/ror-dashboard/actions/runs/38226532016) failed on Shopify throttling after authenticating. It retained the previous staging pointer and recorded failure status. Expanded bounded retries then passed the real refresh. The final transport also respects Retry-After, Admin cost refill and ShopifyQL's separate `windowResetAt` budget; an oversized complexity request fails rather than repeatedly retrying it. Official behavior: [ShopifyQL error and budget documentation](https://shopify.dev/docs/apps/build/shopifyql/graphql-admin-api/errors-limits-and-performance).

The staging workflow is manual or triggered by relevant collector/refresh/workflow updates to this same-repository P2 branch only. It has read-only repository permissions, uploads review artifacts, and never commits, deploys, overwrites production exports or enables a production schedule.

The final transport implementation also passed a second [real credential-backed run 38229158874](https://github.com/GrahamROR/ror-dashboard/actions/runs/38229158874) at branch commit `9b1bb23f11cda388e7a2d5e2694cc4e7ccf566ab`. Its artifact checksum was independently verified and every day, native control period and product fact is identical to the committed review snapshot. It passed rollback from snapshot `20384ecbd5214a0cbcfc7a832c8dab30e61c807e166bf6f84ded7001e260324b` back to the committed `dfd6416590ad2cd7346584d3d46db8afe8552a424e372e58908ae65814e12ff1` and forward again, preserving both. [Final refresh validation](github-final-refresh-validation-20261012.json). The committed source snapshot remains the reviewed first successful capture; the repeat run changes capture provenance, with identical financial facts.

## Dashboard and regression verification

129 automated cases pass locally: 38 finance/integration, 12 ROR calculations, 18 reporting contract, 11 rendered date presets, 16 Ads and 34 insights. Latest-source financial tests use the downloaded GitHub snapshot. Retained private raw evidence is independently replayed to its own immutable predecessor, rather than incorrectly assuming it should match a newer capture. CI skips two private raw-evidence tests when those captures are absent.

Browser checks after the real refresh passed all three Shopify bases across both dashboards, all seven Growth tabs, all 99 date-selector/basis selections, basis-invariant All Stores KPIs, three contribution charts and five separate-series explorer chart types, goal lock/unlock, forecasting sliders, Email sorting and Ads filters/metrics/granularities. Ads' exact-date Shopify order comparison matches 13 native orders for 11 October. Desktop/mobile All Stores layouts have no page overflow. [Desktop evidence](screenshots/all-stores-legacy-20261012.jpg), [mobile](screenshots/all-stores-legacy-mobile-20261012.jpg).

Yesterday now uses the London prior reporting day rather than the stale legacy marketing date. For 11 October, financial totals/orders/native AOV are current; nonfinancial/cost facts from 7 October are unavailable for the new date with their original capture date clearly stated. Their source records, forecasts, tools and integrations remain intact; no dated data is silently relabelled. Margin estimates retain the original costed ledger.

All five protected exports remain byte-identical. No merge, deployment, main-branch write, StockHub change, Etsy/NOTHS financial change or Xero integration occurred.

During work the original repository directory disappeared. The existing P2 branch was recovered into `/tmp/ror-pr2-recovered` and all completed code, staging evidence and private history preserved. No existing repository was recreated or overwritten.

Outstanding source limits: native AOV for arbitrary uncaptured custom intervals; old July shipping/tax/other component split and original cutoff order-ID ledger; accountant approval before asserting VAT-exclusive turnover. Legacy All Stores coverage and channel reconciliation remain P3 work. Production publication and scheduled canonical refresh still require approval.
