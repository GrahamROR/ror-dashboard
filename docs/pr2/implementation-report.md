# P2 correction: accurate finance in the existing dashboards

[PR #15](https://github.com/GrahamROR/ror-dashboard/pull/15) remains on `codex/pr2-canonical-shopify-finance`, based on [P1 #14](https://github.com/GrahamROR/ror-dashboard/pull/14). Main was fetched again and remains `9fdb6e367589bf47181a5ecb8ad9835848ba7c34`. No merge, deployment or production publication occurred. The original dirty checkout and its unrelated work remain untouched.

## Existing interface preserved

The replacement finance application and stylesheet are removed. The original App and RorSalesApp consume shared, integrity-checked financial adapters. There is no finance route or additional navigation; `?finance=staging` renders the same original interface. All seven Growth tabs, original goals/sliders/forecast tools, KPI cards, marketing analysis, tables/charts and ROR comparison/contribution/explorer remain. The small financial-basis selectors share state and preserve nonfinancial metrics.

Revenue uses selected net/gross/total merchandise definitions; eligible orders come from Shopify's native measure. Native Shopify AOV remains independent; calculated Net AOV and selected-basis sales per order are explicit. Existing forecasts and revenue targets stay on Total Sales; their numeric targets are not changed by the basis selector. Net sales is not asserted to be VAT-exclusive accounting turnover. Margin's cost/profit/LTV estimates retain the original costed source with explicit labels, while its net revenue column uses verified source values. Ads attribution, spend and conversion value remain unchanged; its Shopify actual-order comparison now uses canonical eligible orders for the exact selected dates, while sessions/conversion retain their original monthly source.

Etsy/NOTHS imports and calculations remain unchanged. Individual channel amounts and separate charts remain available, with basis labels. Combined revenue/AOV and mixed-basis stacked/share charts show unavailable rather than inventing a reconciled consolidated amount. P3 remains separate. All P1 date controls retain the same eleven presets and London resolver; independent dates, missing coverage and incomplete comparisons remain explicit.

## Source and reconciliation

Fresh connected read-only Shopify reports captured 8 October cover 1 January 2024–7 October 2026: 1,011 days and 14,847 product/day rows, GBP, Europe/London, `rockonruby.myshopify.com`. Current shop pricing is tax inclusive; historical native taxes, including zero taxes, remain as reported. Retrieval time is preserved without claiming a source-side update timestamp.

| FY26 metric | Original Growth | Corrected Growth and ROR | Shopify native |
|---|---:|---:|---:|
| Gross merchandise sales | Not stored | £276,221.01 | £276,221.01 |
| Net merchandise sales | £247,541.41 | £247,999.66 | £247,999.66 |
| Total sales | £312,828.22 | £313,437.06 | £313,437.06 |
| Eligible orders | 7,813 | 7,832 | 7,832 |
| Native AOV | £32.23 | £32.22 | £32.22 |
| Calculated net AOV | Not separately stored | £31.66492084 | Net sales ÷ eligible orders |

All 44 independently captured monthly/period controls reconcile at penny precision, with 130 before/after rows. FY26 benchmarks are comparisons only and never enter the transformation. Product amounts reconcile including unassigned adjustments; the existing top-ten product interface is retained.

July's frozen MTD export changes from £14,807.43 total / £11,161.42 net / 426 orders to £15,416.27 / £11,619.67 / 445. The other eleven months match on those metrics. Original exports and the prior immutable snapshot remain available for rollback. The July £150.59 shipping/tax/other component difference cannot be split from the original export, which lacks those separate components; no balancing allocation was invented.

ROR originally imported £318,134.63 gross lines and 7,834 orders. That amount is a different basis. Secure, read-only ID reconciliation proves all 7,832 native eligible IDs are present, with no cross-day duplicates and two extra imported orders. Both extras are paid, uncancelled, non-test gift-voucher-only orders; their native sales-report order count is zero. Shopify sales reports exclude gift card products. No local exclusion was introduced. Public counts and private evidence hashes are in [order-count-reconciliation.json](order-count-reconciliation.json); order/customer identifiers are not committed. Read-only database metadata confirms zero writes; StockHub code/data are unchanged.

[Full reconciliation](reconciliation.md), [machine-readable financial rows](reconciliation.json), [screenshot comparisons](screenshots/README.md).

## Refresh changes and tests

`node scripts/fetch-data.js --finance-staging` adds a staging path through the existing fetch entry point and existing Shopify credentials. Normal production behavior and all existing schedules remain unchanged. The staging refresh queries all retained history in calendar-year partitions, including closed years, to capture late refunds and historical adjustments. Independent monthly/FY controls, product totals, schema/identity/row caps and missing observations must validate before an atomic pointer update. A failed batch retains the last good snapshot and records a visible failure state. Previous snapshots remain immutable; rollback restores a verified predecessor.

The new manual-only GitHub candidate uploads staging audit/snapshot artifacts, with read-only repository permissions. No production schedule, automatic commit or deployment is enabled. Full transport is mock-tested across year boundaries; the existing fetch entry point was run against fresh connected source evidence. A live secret-backed GitHub refresh is not claimed and remains a release validation step. No Xero connection, import, dashboard, interface, account mapping or API integration exists.

126 automated cases passed, zero failures and no local skips: 35 finance/integration, 12 ROR calculations, 18 reporting contract, 11 rendered date presets, 16 Ads, 34 insights. CI skips two private evidence replay/validation cases when raw captures are absent; public financial/control tests still run. Browser acceptance passes all 99 preset-selector/basis selections, three cross-dashboard FY26 basis checks, seven original Growth tabs, all ROR metrics/granularities/chart types, goals/sliders/locks, Email sorting, Ads controls and Margin LTV display. Desktop/mobile layouts show no overflow. Fetch/hash failures preserve original navigation and expose unavailable financial values. Failed refresh warnings appear in both dashboards while retaining the last validated snapshot. Zero page errors. All five protected exports pass byte-for-byte checksums.

See [test-results.txt](test-results.txt) and the reproducible [browser acceptance](../../finance/test/browser-check.js). Paired before/after screenshots cover every Growth tab, Shopify-only and all-store ROR, and both mobile interfaces. Visual review confirms original design and components are retained; the before screenshots use P1's original interfaces, not the discarded finance application.

## Outstanding review decisions and source limitations

- Approve net merchandise as the commercial management default. Any accounting/VAT-exclusive turnover assertion requires accountant verification; source treatment is preserved and no VAT factor is applied.
- July's historical shipping/tax/other difference has no separable old component ledger. The original cutoff's order-ID ledger is also unavailable, so the aggregate 19-order July difference is established without claiming a status-by-status historical explanation.
- Arbitrary custom intervals without an exact native AOV query show unavailable native AOV. Additive amounts, native eligible orders and calculated net/selected-basis AOV remain correct. Source-side update timestamp and connected transport API version were not exposed.
- Cost/profit/LTV estimates remain on their existing costed inputs; a cost-ledger reconciliation is outside this correction. Etsy/NOTHS combined finance awaits P3.
- Production rollout and canonical automatic-refresh enablement require separate approval. Validate the manual workflow with authorized live credentials before production cutover, publish one common pointer and retain its predecessor. Existing automatic production imports continue as before.

Definitions: [Shopify sales reports](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/sales-report). Commands and safety/rollback details: [finance README](../../finance/README.md).
