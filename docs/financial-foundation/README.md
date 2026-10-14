# Simplified financial foundation — review only

Base: production main `0bbdd122d6d6ccb7f5cd2c11a5cdc7c1d2092721`, before PR21. This branch selectively reuses proven financial collection, reconciliation and source aggregates. PR21 remains unmerged as the archive for scenarios, cost inputs and the proposed LTV methodology.

## Original interface

The complete original CSS is byte-identical, including responsive rules, typography, colours and spacing. The original seven Growth tabs, KPI grid, monthly tables, chart containers, annual goal slider/lock, conversion/AOV sliders/locks/reset and full ROR Sales sections remain. No scenario buttons, Break Even controls, cost panels, new planning sections or separate financial interface are included.

The existing prominent sales value shows the selected actual, independent of the goal's basis. Net / Gross / Total change actuals, relevant tables, charts and AOV denominators. The original goal card separately shows Net Sales actual, paced target and variance. What-If conversion/AOV projections use Net Sales. A local goal-slider change can reset to the approved main goal; it never writes shared targets.

FY27 approved annual goals: Shopify £300,000 Net Sales; All Stores £500,000 provisional management Net Sales. Current All Stores progress is unavailable while marketplace evidence is missing. Historical Shopify annual goal amounts remain £500,000, now explicitly compared on the requested Net Sales management basis. The underlying normalized seasonal allocation is unchanged. There is no new All Stores seasonal forecast or combined scenario model.

## Financial acceptance

| FY26 metric | Amount | Status |
| --- | ---: | --- |
| Shopify Net Sales | £271,670.54 | Native net merchandise £247,999.66 + net shipping £23,670.88 |
| Shopify Gross Sales | £300,105.51 | Native gross merchandise £276,221.01 + independently validated original gross shipping £23,884.50 |
| Shopify Total Sales | £313,437.06 | Native Shopify Total Sales |
| Shopify eligible orders | 7,832 | Unchanged native eligible count |
| Etsy management Net Sales | £25,744.84 | Provisional VAT management treatment; native Stats merchandise £30,389.99 / 1,051 preserved |
| NOTHS management Net Sales | £100,723.80 | Provisional original customer order-cohort totals / 1.20; NOTHS 3,786 is a placed-order cohort, not verified eligible orders |
| All Stores management Net Sales | £398,139.18 | Provisional; channel tax treatments are not certified accounting turnover |
| Explicit legacy All Stores gross | £466,955.48 / 12,680 orders | Original imported values retained only on explicit selection |

NOTHS cumulative refunds are not assigned posting dates or deducted again. Discount funding, refund timing, the £7.58 component difference and £6.27 excess remain disclosed in expandable financial information. October Etsy and FY27 NOTHS are absent: management Net Sales is withheld, never substituted with gross. Etsy August/September candidate and original FY26 source controls remain preserved.

The preview's unchanged production Shopify snapshot lacks the new original-gross-shipping field, so Gross Sales is unavailable until an approved refresh publishes it. A staging source capture exercises the actual new collector before merge. No annual benchmark is injected into daily rows. Daily/monthly/FY sums, every date preset/custom interval, orders, source AOV and Growth/ROR agreement have regression coverage.

## Margin, LTV and attribution

Existing product-only costed margin/profit inputs and calculations remain untouched. Shipping-inclusive sales are not multiplied by a product margin to invent a profit target. Native merchandise figures remain separate in Margin and Products. LTV collector, exported LTV figures, Meta/Google attribution and Klaviyo source figures are unchanged. Existing period-proxy caveats remain; no new LTV method, dependent workflow or V4 export is introduced.

## Testing and visual gate

Local regression: 136 tests, 134 pass, 2 existing private-evidence skips, zero failures; includes the private native gross-shipping capture. Headless component/handler checks cover all seven tabs for FY26/FY27, prominent selected actuals, original model slider/reset behaviour, annual goal lock/reset and ROR sections. These are not browser screenshots. Public CI intentionally omits the private gross-shipping capture; native transport/control tests remain mandatory.

Approved browser-control tooling is unavailable. No fresh desktop/mobile screenshots or visual pass are claimed. Merge remains blocked on side-by-side visual acceptance and explicit owner approval.

For manual acceptance, serve production main and this branch separately. Use the same viewport and FY/basis/tab/scroll position for each screenshot. Suggested widths: 1440px desktop and 390px mobile. Capture Overview, Yesterday, Monthly, Products, Email, Ads, Margin and ROR Sales. Compare navigation, cards, goals, sliders, tables, chart containers, spacing, fonts, colours and horizontal overflow. Select each basis; the top actual must change prominently. Test conversion/AOV lock/reset and goal lock/drag/reset. Verify Provisional marketplace labels, missing FY27 periods and unavailable gross before refresh. No scenario or cost controls should appear.

## Release and rollback

Do not merge/deploy without visual parity approval. After approval: merge this PR only, run existing Fetch Dashboard Data on main, wait for validated matching snapshot/manifest/status, confirm gross shipping and source cutoff in the served file, then verify Pages assets and both dashboards. Existing daily schedules are unchanged. LTV remains on its existing methodology; no forced new LTV publication is required by this release.

Retain main's exact original exports and all immutable finance/marketplace snapshots. Roll back only this feature's code and approved source pointers, preserving newer unrelated daily exports and historical snapshot files. Do not reset main or force-push. StockHub/Xero are untouched, and PR16/20/21 remain unmerged.

## Credential-backed staging result

[Staging run 38578040595](https://github.com/GrahamROR/ror-dashboard/actions/runs/38578040595) passed on this branch at collector revision `a8c3937`. Collection covers 1 January 2024 through 13 October 2026 (Europe/London); 41 independent native control intervals passed, including original gross shipping £23,884.50 and FY26 Gross Sales £300,105.51. Snapshot `d07bcba87ff030a96aeeb04840ba57825b73067fe319e39eda58cc9f18a8a3cc` matches its manifest SHA256 `4d3ac1f64e6ffe9b47844c5b2e5e48589f5573f6152949ad828072b8c6b464bc`. Final local regression also uses this newly collected staging snapshot, rather than only the earlier private capture. Later review changes concern display/product-share denominators; collection and publication validation functions are unchanged.

Failed-refresh last-good retention, warning publication, live API recovery, preservation of concurrent unrelated exports and isolated rollback passed. All previous snapshots were retained. Rollback reference: `437cbe465793d84c3175b23bab2cd49cdc3d98ecef8daab63ef36c43c1cfc3f2`. Publication/Pages verification ran against an isolated local Git remote/mock; no production publication or external Pages build occurred.

Local comparison URLs: production-main reference `http://127.0.0.1:8773/`; simplified branch with unchanged production snapshot `http://127.0.0.1:8772/`. Neither is deployed. The latter intentionally withholds Gross Sales until a validated gross-shipping snapshot is supplied.

For pre-merge Net/Gross/Total visual acceptance with the actual validated source, use `http://127.0.0.1:8774/`. This serves the same simplified interface from an isolated copy, with only its local finance pointer/status switched to the matching staging snapshot. Production and review-branch exports remain unchanged. Compare this against the production-main reference at port 8773; use port 8772 specifically to check the old-snapshot unavailable-Gross warning. These previews are inspection aids, not claimed visual acceptance.
