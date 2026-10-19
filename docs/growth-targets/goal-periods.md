# Goal-card periods and optional content estimate

The existing Shopify Growth goal card uses the familiar reporting-style menu: current/selected FY, previous FY, rolling 12 months, calendar 2024/2025/2026 YTD, this month, last month, last 30/7 completed days and Custom range. This quarter and Next quarter are the only extra choices. The long fiscal-quarter/month list is removed. This quarter in October 2026 means 1 October–31 December (calendar Q4); This month is the full planning month, with actuals stopping at the verified day.

## Targets and planning

This is local What-If planning, not a saved target, financial basis or replacement dashboard. The annual slider remains £20k–£800k in £1k steps, with the approved FY27 Shopify £300k reset unchanged. Other reporting filters, headline actuals, ROR Sales, native source records, Ads/Email attribution and LTV/margin calculations are unchanged.

Targets retain the existing seasonal allocation. Partial-month targets are differences between rounded cumulative targets, so adjacent periods preserve annual pennies. Q4 2026 at the approved £300k FY27 goal is £99,687.50: October £18,750, November £36,562.50, December £44,375. Monthly average is £33,229.17 across 92 days.

Cross-FY ranges use the approved target for each covered year. The slider edits only the selected FY; an explicit note appears when a range includes another FY. Unknown future-year targets are withheld, never guessed. Whole-period plan shows full planning requirements; Remaining after verified actual uses the Net Sales gap after the completed Europe/London source cutoff and only the remaining days. Missing coverage withholds remaining pace. Ended periods have no fabricated daily recovery rate. Monthly averages use calendar-month equivalents; weekly averages are seven-day rates.

## Reels / carousels

A sixth card beside Sessions/day shows estimated extra Reels needed (or Carousels after format selection). Inputs live in a collapsed assumptions section. Average views start at **3,000**, Instagram share at **20%**, both explicitly labelled planning assumptions. The view-to-website-session rate and expected baseline traffic start blank; they are not invented or borrowed from platform attribution. No Windsor/Meta/Shopify forecast API is called.

The formula is:

`required sessions = selected-period Net Sales requirement / (assumed Net Sales per order × assumed conversion)`

`extra posts = ceil(max(0, required sessions − baseline expected sessions) × Instagram share / (average views × view-to-session rate))`

Whole-period mode needs baseline traffic for the whole selected period. Remaining mode needs baseline traffic for the remaining days only; revenue already achieved is already deducted by the financial planner and must not be deducted again. Baseline excludes the new posts being planned. Changing period/mode/cutoff invalidates and clears the baseline. Format changes clear the traffic rate for review. Empty inputs are not zero; an explicitly entered zero baseline is valid. Only the final post count rounds up. Zero additional allocated Instagram sessions gives zero posts; missing/zero/invalid rates do not yield Infinity or a fabricated result.

Illustration, not a dashboard default: £150,000 / (£32.36 × 1.96%) = about 236,497.57 sessions. With baseline 230,000, 20% Instagram allocation, 3,000 views/post and a hypothetical 1% view-to-session rate, the result is **44** extra posts. At 6,000 views it is **22**, only if all other assumptions hold. The dashboard uses its existing Net Sales per-order assumption rather than copying the screenshot's £32.36. Impressions/views are not website sessions, and this estimate is neither attributed revenue nor evidence of causal incrementality.

## Verification and release

163 automated tests: 160 pass, 3 intentional private-evidence skips, zero failures. Tests cover date presets, quarter/year/leap/DST boundaries, cross-FY budgets, exact allocation, remaining coverage, zeros, post rounding, missing/invalid traffic inputs, inverse views/rate relationships, unchanged goals/headlines and original model/lock/reset controls. Source-export hashes and the complete production CSS block remain unchanged.

Approved browser-control tooling is unavailable; headless component/handler checks are not a screenshot or browser pass. Review at desktop/mobile widths: simple menu, Q4, custom dates, whole/remaining mode, sixth card, editable views, and collapsed assumptions. Check the estimate stays unavailable until the required assumptions are supplied. Ensure the original tabs, source figures and reporting controls remain intact.

No merge/deploy, new schedules, financial refresh or source edits are included. Rollback is a scoped code revert; financial-data rollback is unnecessary.

## Historical traffic reference and measuring Instagram

“Use last year’s traffic” fills the local baseline from complete Shopify session months for the same calendar window one year earlier. For Q4 2026 the reference is Q4 2025: October 19,841 + November 33,757 + December 44,680 = **98,278** sessions. This is a seasonal reference, not a validated forecast or uplift model. It includes last year’s organic and paid activity, which must be maintained or adjusted explicitly; it does not isolate a no-Reels counterfactual. Partial months are prorated uniformly and clearly labelled estimates; leap day is clamped to the prior February end. Missing/incomplete/duplicate months withhold the suggestion. Remaining mode uses only the matching remaining dates, not the whole quarter. The user can override it.

The screenshot’s 350 extra posts follows from 52,388 required sessions, baseline 1, 20% share and 30 sessions per post (3,000 × 1%). It is not a measured content recommendation. Do not tune assumptions simply to force a feasible answer. Zero extra posts means the chosen baseline meets the model’s traffic requirement; it does not mean no marketing is needed.

Measure an observed traffic ratio using tagged organic Instagram links and corresponding content views for the same window: website sessions / views × 100. Suggested campaign tagging: utm_source=instagram, utm_medium=organic_social, utm_campaign=q4_content_test, utm_content=<trackable-placement>. GA4 Traffic acquisition reports session source/medium and campaign (Google documentation: https://support.google.com/analytics/answer/10917952). A shared profile link cannot assign sessions to individual Reels, so only report an aggregate ratio unless distinct placements are trackable. Exclude paid traffic, keep format/window definitions consistent and do not equate observed attributed sessions with causal additional sessions. Do not use total Instagram sessions over Reel-only views. No account changes or new tracking integrations are made here.
