# Phase 3 — Shopify Performance

Yesterday is replaced by Performance with Yesterday, Last 7 days, Last 30 days and Last 90 days. This is the explicitly chosen first set; 21/60-day and calendar-quarter views remain optional later additions. The selector is driven by one plain preset array, also used by collection and refresh recovery.

Each completed inclusive London window gets its own direct Shopify Analytics sales and sessions queries. AOV, customers, conversion and costed-SKU ratios are not reconstructed from daily/monthly averages. The original `data.yesterday` field and closed-year blocks remain unchanged. Missing query rows/components fail collection before any export write, retaining the last good file. Additional windows cost eight query calls per daily capture; no new credentials or scopes are introduced.

Displayed Net/Gross/Total Sales and source orders always come from the unchanged canonical `ShopifyIntegration.report` contract. New captured marketing/cost metrics and source AOV are accepted only when exact window bounds, net merchandise, total sales and orders match canonical controls. Source failures and mismatches are disclosed and withheld. A legacy exact-day capture remains usable only for Yesterday and has its own explicit, unverified-fallback disclosure. Financial amounts never fall back to legacy query amounts.

Profit retains the existing product-only `net merchandise × costed-SKU margin` estimate, including signed periods, with cost coverage shown; no operating-cost estimate or shipping-inclusive profit target is introduced. Targets sum the existing `dailyTarget` per trading date, using each date’s own FY goal. A closed FY’s page selection cannot leak its goal into current Performance; a current-FY local What-If goal applies when that FY is selected. Sessions targets use the existing annual sessions goal and same seasonal maths.

The existing monthly queries now explicitly end yesterday, rather than the FY end, and write `marketingCoverage` with exact completed bounds. This lets phase-two Sessions average use a proven completed-day denominator. New-FY day one avoids a reversed query and records `no-completed-days`; first-of-month and London/BST calendar boundaries are tested. An open dashboard re-reads the export every 15 minutes, preserves its selected FY and retains last good data on transient failure.

No management completeness, shared target/goals, marketplace, historical or Ads source logic is changed. The daily refresh guard requires every configured Performance window’s exact completed range before skipping collection.

## Evidence

- Full `node --test` with fresh protected baselines: 251 tests: 247 pass, four expected private-evidence skips, zero failures. Existing stale checked-in hash expectations are unchanged.
- New production-entry tests verify the original Yesterday object and historical FY blocks survive; failed new calls cannot write partial output; month/FY boundaries and London midnight are correct.
- Read-only live verification run [42816419946](https://github.com/GrahamROR/ror-dashboard/actions/runs/42816419946) passed all four windows against canonical net merchandise, total sales and order controls through 09-11-2026.
- Extended read-only verification [42817447038](https://github.com/GrahamROR/ror-dashboard/actions/runs/42817447038) also passed the changed monthly sales/sessions queries and native monthly controls. The job has contents-read permission, no publication step, and verifies protected repository files remain unchanged. Its artifact contains only aggregate metrics.
- Real Chrome preview uses those actual API aggregates via a private response override, not an invented or committed production export. All four windows, Net/Gross/Total canonical sums, sessions/AOV, FY independence, DD-MM-YYYY dates and mobile layout pass without page errors.
- Claude confirmed the source/maths architecture and required clearer legacy fallback disclosure; that finding is fixed and regression-tested. Claude approved the corrected source diff, conditional on the extended real-API check passing; that check is now successful. Public production checks follow in the release handoff.

The existing [ShopifyQL interface](https://shopify.dev/docs/apps/build/shopifyql/graphql-admin-api) supports explicit date-window queries; [Shopify’s error guidance](https://shopify.dev/docs/apps/build/shopifyql/graphql-admin-api/errors-limits-and-performance) confirms parse errors must be checked even on HTTP success. This implementation retains those checks and uses explicit completed dates.
