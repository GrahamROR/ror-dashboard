# PR #17 final review — 13 October 2026

Both requested adjustments are complete. The existing interface, verified finance calculations and Total Sales goal basis are preserved.

## Changes

- Removed inline `display:flex` from the mobile-only freshness line, which overrode the desktop CSS. The flex layout now applies only inside the existing mobile media query. One marketing timestamp is visible on desktop and mobile.
- Current-year Sessions uses a neutral **annual progress** badge and explicitly identifies the 350,000 annual goal and percentage achieved. There is no verified seasonal Sessions plan, and its legacy marketing cutoff can differ from financial coverage, so no invented YTD target is introduced. Zero remains a real value; missing Sessions remains pending. Completed years retain the comparable full-year assessment.
- Orders already uses the paced revenue goal divided by the agreed £48 goal AOV. Added null handling so missing financial coverage cannot become an implied zero-order target. Revenue remains paced. Conversion (3.5%), repeat rate (25%), native AOV (£48), channel ratio and list-size goals are unchanged.
- Test-only CI records the checked-out five daily exports before tests and verifies them afterwards. This accepts legitimate newer daily exports in GitHub's synthetic PR checkout without rewriting historical baselines or production files. Financial-artifact preservation checks remain unchanged.

## Latest-main compatibility and tests

- Latest main: `b360e7d565361e3be8b083fc7dd27f6cb62326b8`, fetched again after testing.
- Code under test: `948f37a`; isolated compatible tree: `c5f00af546b01657c381b932edc92617298bb7d1`.
- Used `git merge-tree` and an exported temporary tree only; no branch or PR was merged. All five preview daily exports exactly equal latest main. Their hashes are recorded separately here; original evidence baselines remain intact.
- Branch automated suites: **71 passed, 0 failed**.
- Latest-main compatible export: **69 passed, 0 failed, 2 skipped**. The two repeatable native-source-build fixture tests require private source files absent from the exported checkout; both passed in the original local checkout. Full logs attached.
- Financial reconciliation rerun: **41 native control periods, 130 before/after rows**; report unchanged. Tracked financial artifacts and latest-main exports passed SHA-256 preservation checks.

## Browser verification

Tested the latest-main compatible copy via localhost, with CUA browser automation and a temporary no-cache preview server.

- Desktop 1440×1000: mobile freshness computed display `none`; exactly one visible Marketing updated line.
- Mobile 390×844: mobile freshness `flex`, desktop pill hidden; exactly one visible Marketing updated line. No page horizontal overflow (client width and scroll width both 386).
- Breakpoint 768px: one timestamp, mobile line visible. 769px: one timestamp, mobile line hidden.
- FY27 Sessions: **50,527**, neutral annual progress, **14.4% of 350,000**; completed FY26: 267,714 vs annual goal, historical annual comparison retained.
- Conversion and repeat rate retain their existing static goals. Orders retains the comparable paced target (1,761 for the current verified cutoff).
- FY26 Gross £276,221.01, Net £247,999.66 and Total £313,437.06 all appear under their selected bases. Full-year target £500,000 and variance −£186,562.94 remain correct.
- FY27 target **£84,526.22 through 11 October**; fixed Total Sales goal-basis actual £45,693.26 and net actual £35,179.96 remain unchanged despite newer marketing sessions.
- All seven original Growth tabs rendered (Overview, Yesterday, Monthly, Products, Email, Ads, Margin); zero browser console errors.
- Freshness still accurately warns that financial coverage is through 11 October while marketing data updated 13 October at 10:55. No finance refresh or publication was activated to suppress that warning.

## Screenshots

[Desktop FY27](desktop-fy27.jpg) · [Mobile FY27 full page](mobile-fy27.jpg) · [Mobile header](mobile-header.jpg) · [Desktop FY26](desktop-fy26.jpg)

## Release boundaries

No merge, deployment, production data change, schedule change or finance activation. P3, StockHub, Xero, Etsy and NOTHS are untouched. No known blocker remains for these two UI corrections. Existing stale financial coverage is disclosed and remains a separate operational freshness condition, not fabricated or silently substituted.
