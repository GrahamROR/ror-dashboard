# Management reporting and scenarios — review candidate

This branch extends the original dashboards. It does not change native Shopify facts, paid attribution, Email values or production exports. No merge, production collection or deployment is authorised by this PR.

## Dependency audit

| Consumer | Source / contract | Change or deliberate gate |
| --- | --- | --- |
| Growth Overview / Yesterday / Monthly | `finance/integration.js` → `finance/management.js` → canonical snapshot | Native net merchandise + net shipping; source-selected sales/order, native AOV separate |
| Growth Products | Canonical product facts | Shipping not allocated; merchandise rankings / merchandise denominator retained |
| Growth goals / What-If | `planning/config.js`, `planning/scenarios.js`, `growth/targets.js` | FY27 Shopify £300k net including shipping; historical £500k Total Sales preserved |
| ROR KPIs / comparison / explorer / contribution | `dashboard2/calculations.js` → management contract | Shared Shopify; controlled Etsy; NOTHS provisional cohort; explicit legacy view |
| All Stores annual planning | Published independent £500k management Goal | £600k illustrative; FY26 combined-channel seasonal illustration; profile approval remains pending |
| Margin | Existing costed-SKU COGS / profit | Product-only estimate preserved; shipping revenue shown separately; contribution withheld without costs |
| LTV:CAC | `finance/dependencies.js`, canonical net merchandise/orders + legacy customer/cost inputs | v4 product-profit period proxy; no shipping-margin uplift; no unique-cohort or paid-only CAC claim |
| Ads | Original `ads-data.json` | Native ROAS / CPA unchanged; separate matched-period store revenue, whole-store revenue/spend ratio requires both platforms |
| Email | Original `email-data.json` | Numerators unchanged; selected-basis ratio withheld when exact source windows absent; old source ratio qualified |
| Shopify refresh | Existing full-history collection → validated immutable snapshots | Shipping-inclusive management derived dynamically; refresh requests native gross shipping and validates daily sums against each native control; old snapshots lacking the component remain supported and withhold gross including shipping |
| Marketplace refresh | Controlled Etsy CSV/Stats importer, NOTHS native capture / independent gross controls | No new schedule / StockHub integration; October Etsy and FY27 NOTHS unavailable |
| Financial derivatives publication | `finance/publication.js`, `scripts/publish-data.js` | Reject changed finance/status or legacy input dependencies; never force-push |

## Definitions and FY26 controls

- Shopify management = native net merchandise £247,999.66 + net shipping £23,670.88 = £271,670.54. No flat VAT division. Total Sales remains £313,437.06 / 7,832 eligible orders.
- Shopify gross merchandise £276,221.01 is verified. Gross shipping £23,884.50 was independently confirmed through the connected read-only Shopify report on 14 October. 1,017 native daily records reconcile to 34 monthly controls and the FY26 annual control. Gross including shipping = £300,105.51. Raw reports and the candidate remain private. Existing published snapshots are untouched; the first approved refresh with the new optional component enables this measure. Until then old snapshots explicitly withhold it.
- Etsy provisional management = (£30,389.99 Stats merchandise + £503.82 shipping) / 1.20 = £25,744.84. Eligible original merchandise £32,366.20 / 1,051 orders retained. No second partial-refund deduction.
- NOTHS provisional management = £120,868.56 original customer totals / 1.20 = £100,723.80. Merchandise £116,150.70 + delivery £6,325.64 = £122,476.34 gross. 3,786 is a placed-order cohort count, **not certified eligible orders**. Discounts already included; cumulative refunds are not silently deducted. Funding £1,560.71, refunds £941.81, component residual £7.58 and refund excess £6.27 remain disclosed.
- Combined management = £398,139.18. Provisional mixed source-tax/20% assumption; not certified VAT-exclusive accounting turnover. Combined gross / merchandise totals are unavailable until tax-compatible definitions are approved. Legacy imported gross remains independently selectable.
- VAT penny policy: derive cumulative 5/6 amounts in date order within each financial year; each day's estimate is the difference between consecutive rounded cumulative amounts. Daily and monthly estimates therefore sum to the annual rounded formula. An arbitrary selected interval can differ from separately rounding its own 5/6 sum by a penny. This is a derived rounding allocation, **not an adjustment to source records**.

## Targets and persistence

Read-only published targets in `planning/config.js` include financial year, scope, basis, approval, effective date, version and assumptions. Historical records are retained. FY27 approved Goals: Shopify £300k and All Stores £500k. Ambitious £350k / £600k are illustrative and visibly awaiting approval. Shared target edits require an owner-approved configuration PR/version; browser controls contain no write credentials. Custom scenarios are local and resettable; locks do not save an official target.

Break-even requires reviewed fixed costs / contribution ratio, Shopify overhead allocation or All Stores sales mix. Local assumptions are editable; results remain provisional operating break-even, not cashflow break-even. Contributions must cover product, labour, packaging, postage, fulfilment, commissions, processing fees and variable marketing. No amount is inferred from SKU gross margin alone.

Shopify seasonality remains normalized with largest-remainder penny targets. Current-month pacing uses the latest covered completed London day. All Stores does not silently inherit Shopify seasonality. The planner derives an explicitly illustrative FY26 combined management profile from all three channels. Monthly allocations reconcile to the independent annual Goal; this source-based assumption is not an approved shared profile. Missing FY27 actuals and forecasts remain withheld.

## Refresh / release / rollback

Schedules remain unchanged. Finance is fully recollected/verified by the existing workflow; management calculations consume its new immutable revision automatically. LTV reads the latest committed financial dependencies and fails if finance is behind legacy capture, failed/mismatched, or incomplete for its windows. Its producer records snapshot/checksum/coverage/version plus the cost/customer input checksum. Publication guards these dependencies after fetching the newest remote tip, including during push retries. Newer unrelated exports are retained.

Etsy stays on the paired CSV + independent Stats process: August/September candidates retained, October absent. NOTHS `import-noths.js` has no network/writes to source systems: a supported complete capture, reviewed monthly native gross controls, unique IDs, dates and GBP are required; output goes to independent staging. The existing collector is read-only and is not scheduled or activated. Raw captures/control evidence stay private. Approve/import a new sanitized immutable snapshot only after controls pass; retain its previous pointer for rollback.

Release requires owner approval plus desktop/mobile visual acceptance, a successful first native-gross-shipping refresh before promoting that option, approval of the illustrated All Stores seasonal profile for official forecasts, and cost approval for contribution outputs. Do not claim missing FY27 marketplace management totals.

After approval, merge this coordinated PR; existing Pages handles code and sanitized candidate snapshot. Run the existing financial refresh first, then derivative LTV; verify served checksums/source IDs and both dashboards. No automatic old LTV rewrite is in the PR. V3 1.50:1 / 2.26:1 remain historical estimates, not constraints on V4. Offline V4 preview with the unchanged published rolling-window spend gives 1.48:1 / 2.20:1; these are not newly API-verified or published. Cumulative V4 is clipped to canonical source-covered completed months beginning January 2024; matching spend must be recollected for its changed interval, so no offline cumulative value is manufactured.

Rollback only this feature's code/config and marketplace pointer; preserve every newer daily export and immutable financial snapshot. Do not reset main or revert unrelated daily commits. If V4 LTV has been published, retain it as history, pause its refresh and restore the saved V3 last-good export with a scoped approved data change; no changes to Ads or native finance.

## Acceptance evidence

Automated tests cover FY26 calculations, all monthly/daily aggregation, missing source/basis gates, native source immutability, exact legacy totals, scenarios, break-even validation, custom reset, London pacing, original date controls, dependency failures, refresh/publication/rollback, Ads fractions/coverage and preserved original tab component trees. See `test-matrix.md` for explicit mapping. Headless React element checks are **not browser screenshots**.

No approved browser-control tool is available. Manual desktop/mobile acceptance remains outstanding: inspect both dashboards at 1440px and 390px, all seven Growth tabs, each basis, FY24–FY27, Goals/Ambitious/Break Even/Custom/reset, all three ROR date selectors, charts/explorer/contribution, missing October and explicit legacy, Margin product-only caveats, Email unavailable alignment and Ads native/source ratio labels. No prohibited browser fallback was used.

## Validation outcome (14 October)

Local full suite: **139 tests, 137 passed, 2 existing private-evidence skips, 0 failed**, with the privately retained native gross-shipping candidate supplied. Public CI omits that private capture and adds one deliberate skip for its source-control test; synthetic gross-component/collection/reconciliation tests remain mandatory. The 16 headless interface cases pass, including both original dashboards and FY26/FY27 × seven Growth tabs. These are not desktop/mobile screenshot evidence. Protected exports and all original finance snapshots/manifests/status match their latest-main exact-byte baselines.

Native gross-shipping definition: [Shopify sales schema](https://shopify.dev/docs/api/shopifyql/latest/schemas/sales_revenue/sales#salesmetric-propertydetail-grossshippingcharges). It is before shipping discounts and excludes shipping reversals, unlike net shipping; no source return is converted into merchandise revenue.
