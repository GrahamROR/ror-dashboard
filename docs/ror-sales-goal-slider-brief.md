# ROR Sales — All Stores goal slider

Add the same draggable Net Sales goal-slider tool that the Growth dashboard's
Overview section already has (`index.html` ~1016–1108: drag-to-explore
slider, lock/unlock, reset-to-main-goal, YTD actual/target/variance,
monthly/weekly/daily/orders-per-day/sessions-per-day derived figures, mini
actual-vs-target bar chart) to the ROR Sales dashboard
(`dashboard2/ror-sales-app.js`), scoped to All Stores Net Sales instead of
Shopify-only.

Keep everything already shipped exactly as it is: the "ROR Total · Monthly
goals" card (`MonthlyGoalsCard`/`MonthlyGoalsContent` in
`dashboard2/ror-sales-app.js`), its run-rate captions (`MonthRunRate`), and
the Performance tab (PRs #34–36). This is additive — nothing is replaced,
removed or restyled.

## What the new card does

- Default value and lock state mirror the Growth slider's pattern: starts at
  the approved All Stores annual goal (`FinancialGoals.annual(goalFY,'all')`,
  currently £500,000) and starts locked.
- Unlocking lets you drag to a hypothetical annual All Stores Net Sales
  goal; a "Reset to main goal" control returns it to the approved figure and
  re-locks it.
- Local what-if exploration only, exactly like the existing Growth slider —
  it never writes a shared/approved target, and needs no new persistence.
- Shows YTD All Stores Net Sales actual / YTD target / YTD variance at the
  dragged value, monthly/weekly/daily average targets, and a mini bar chart
  of actual vs. full-month target per month. Reuse `MiniBar` from
  `index.html` if practical — it's already loaded into global scope before
  `ror-sales-app.js` runs — otherwise a lightweight equivalent is fine.
- Stays scoped to All Stores Net Sales regardless of the page's selected
  store/basis/period filters, the same independence the Monthly Goals card
  already has. `dashboard2/goals.js`'s
  `RorGoalPlan.build(records, range, fy, target, channels)` already derives
  the per-month actual/variance/status shape for an arbitrary `target` — feed
  it the dragged value rather than duplicating the seasonal-allocation maths.
- Pick a sensible drag range for an All Stores goal (the Growth slider uses
  £150k–£800k for a £300k Shopify goal) — scale it for the £500k All Stores
  goal rather than reusing the same bounds verbatim.

## Decluttering — layout is your call

The ROR Sales page has grown to six stacked cards (filters, Monthly Goals,
KPI section, comparison table, channel contribution, sales explorer) before
this adds a seventh. Reorganise this into tabs/sections however keeps it
readable — the Growth dashboard's own tab bar is the obvious precedent — as
long as every existing section and this new card are still present and
fully functional, just regrouped. Collapsible (`<details>`) is fine,
matching the existing Monthly Goals card's pattern, but don't bury anything
that's currently always visible without good reason.

## Validation

Match the bar set by the last three phases: full `node --test` passing
(noting the project's existing private-evidence skips), new tests for the
slider's derived maths (reuse of `RorGoalPlan.build` under a dragged target,
including missing/zero/future-month edge cases), and real Chrome checks for
drag/lock/reset/mobile layout — plus confirmation the Monthly Goals card,
run-rate captions and Performance tab are visually and behaviourally
unchanged.
