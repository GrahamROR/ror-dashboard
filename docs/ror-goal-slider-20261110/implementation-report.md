# ROR Sales — All Stores goal slider

Adds a collapsed **ROR Total · Explore a Net Sales goal** card immediately before the existing Monthly Goals card. Existing visible sections keep their positions and functionality; tabs are unnecessary for this small addition. The slider starts locked at the approved All Stores annual goal (£500,000). Unlock to explore, lock at the local value, or reset to the approved figure and relock. Nothing is stored or published. A change of FY or approved target remounts the local card; page store, basis and date filters do not affect it.

Bounds are derived from the approved goal: 50%–250% (£250,000–£1,250,000 currently), in £5,000 increments. Monthly/YTD allocations call the unchanged `RorGoalPlan.build`; the YTD actual calls the unchanged strict All Stores Net Sales aggregate. Missing source coverage withholds actuals, variance and order pace while hypothetical targets stay visible. Monthly/weekly/daily averages use annual ÷12, ÷52 and the shared plan’s actual FY calendar-day count. Orders/day uses the positive, complete YTD All Stores Net Sales/source-order ratio, with the provisional NOTHS count disclosed. No cross-channel sessions metric is invented.

A separate small chart uses the shared month status, full-month target outlines and actual bars. MTD remains a labelled partial actual, future/missing values show gaps, genuine zero has a marker, and negative actuals extend below the zero line. The existing Shopify MiniBar was unsuitable because its labels and target lookup are Shopify-specific and it coalesces missing actuals to zero. The seasonal-shape limitation is visible on the new card.

## Validation

- Small calculation trial: five tests passed, then Claude approved it before UI integration.
- Final full `node --test`: **259 tests, 255 passed, four intentional private-evidence skips, zero failures**. Uses fresh protected runtime baselines, as CI does; existing checked-in financial expectations were not edited.
- Eight new calculation/render tests cover target changes, seasonal penny reconciliation, immutable actuals, actual source gaps, zero/negative/partial figures, MTD/future months, first-FY-day unavailability and leap-year daily averages. Added to the existing CI job.
- Native reconciliation: **42 control periods** passed. Its generated reports were left out of this UI-only change.
- Real installed Chrome: mouse drag £500k→£850k, keyboard controls, disabled lock, reset/relock, mobile Home/End bounds, exact dragged YTD target against shared plan, historical/store/Gross filter independence, DD-MM-YYYY dates, no page errors and no 390px overflow.
- Before/after Monthly Goals and Performance cropped screenshots are byte-identical; their text and run-rate captions also match exactly. Existing Monthly Goals/run-rate component source, Growth inline code and CSS are unchanged. Generated exports and financial artifacts match their recorded hashes.

See [browser evidence](browser-results.json), [desktop](desktop.png) and [mobile](mobile.png). Final Claude review and production checks are recorded in the PR/release handoff.
