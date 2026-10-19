# Goal-card planning periods

The existing Shopify Growth goal card now has a period selector. Full financial year remains the default; calendar quarters entirely inside that FY, the four financial quarters (August–July), individual months and a custom range within the selected FY are available. Calendar Q4 2026 means 1 October–31 December 2026, distinct from FY27 financial Q4 (May–July 2027). Cross-FY periods are rejected explicitly; they are not silently clipped or assigned another year's approved goal.

This is a local planning view, not a new revenue basis, saved target or dashboard. Approved FY27 Shopify £300k and All Stores £500k targets are unchanged. Reporting filters, the prominent financial actual, What-If controls, ROR Sales, attribution, LTV and cost/margin methods remain unchanged. The goal slider still edits the annual What-If amount and has its existing lock/reset behaviour.

## Calculations

The period target uses the existing normalized seasonal allocation of the annual goal. Partial-month amounts are differences between rounded cumulative monthly targets, preserving annual pennies when periods are split. At the approved £300k FY27 goal, calendar Q4 2026 is £99,687.50: October £18,750, November £36,562.50, December £44,375. This is £33,229.17 average per calendar month over 92 days.

Whole-period plan shows target / calendar-month equivalents, target / days, a seven-day average, orders = target / assumed Net Sales AOV, and sessions = orders / assumed conversion. The original conversion/AOV What-If controls supply those assumptions. Fractional months use the selected days divided by the relevant month's length; remaining Monthly avg is a run rate, not a forecast for a full future month.

Remaining after verified actual uses max(0, period target − verified period Net Sales), spread over days after the verified financial cutoff within the period. Current day is excluded using Europe/London reporting dates. A stale snapshot is shown through its actual verified date; unknown elapsed sales are never inferred. Missing period coverage withholds remaining requirements. Future periods are labelled Not started; expired periods have no fabricated daily/monthly recovery pace. Zero actual revenue is valid, while missing/zero/out-of-range AOV/conversion withholds affected sessions/orders.

The three goal-card actual/target/variance figures apply to the chosen period. Other revenue cards and the Monthly table retain their existing reporting scope. The small comparison chart remains explicitly labelled Annual context. Period target and cutoff are displayed beside the controls, so partial actuals are not presented as full-quarter performance.

## Verification

Full regression: 150 tests; 147 pass, 3 intentional private-evidence skips, zero failures. Coverage includes Q4 target and sessions/order formulas, calendar versus financial quarters, exact penny allocation, leap years, DST-safe day counts, invalid and cross-FY custom ranges, incomplete/zero actuals, future and ended periods, and original model/goal lock-reset controls. Headless handler tests select Q4 and custom dates without changing the annual target or selected financial actual. Production CSS is unchanged.

Two pre-existing regression assertions assumed gross shipping was absent in production. Gross shipping is now live: tests accept the validated live component and construct an explicit missing-field fixture to continue testing unavailable-gross protection. Financial sources themselves are unchanged.

Desktop/mobile visual acceptance remains manual because approved browser-control tooling is unavailable. Check the original goal card at 1440px and 390px widths; select Calendar Q4 2026, adjust CVR/AOV, switch Whole-period / Remaining, test custom dates and annual reset. Verify controls wrap within the card and original tabs/layout remain intact.

This branch does not merge/deploy or change workflows, source snapshots, targets or production exports. Rollback is a scoped revert of the UI/module change; no financial-data rollback is needed.
