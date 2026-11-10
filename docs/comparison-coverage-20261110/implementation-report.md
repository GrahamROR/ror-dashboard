# Sales coverage and comparison fix — 10-11-2026

The reported blank current-period Net Sales came from one missing source day: on the morning of 10-11-2026, the scheduled jobs had not started and retained snapshots ended on 08-11-2026. Scheduled Shopify runs on the preceding days had started around 09:28–10:43 UTC despite a 03:00 cron. Manual recovery through the existing validation/publishing workflows advanced Shopify, Etsy, NOTHS and the independent units export through 09-11-2026. The last successful public data deployment is `060608d09dbd07e6eaf8f3058b73169cd07cf291` (09:05 UTC).

The other defect was in comparison-baseline access: live-period tables and charts only consulted live snapshots, even though compatible older comparison periods existed in the separate archive. The new explicit baseline accessor reuses the prepared archive's full-FY VAT allocation and native Shopify contract. It never changes source facts, extends live snapshot start dates, promotes historical validation labels, substitutes workbook revenue for Net Sales, or supplies invented daily units.

ROR table and chart callers opt into matching selected calendar positions for partial buckets. Equal day counts and complete source coverage are required. Full-calendar-month comparisons retain their usual month lengths. For Last 30 days, 11-10-2026–31-10-2026 can compare with the same dates last year; its previous-month comparison is explicitly withheld because September has no 31st. 01-11-2026–09-11-2026 compares with 01-10-2026–09-10-2026 and 01-11-2025–09-11-2025. Visible selected dates and distinct missing-source labels replace the generic incomplete-period label. Shared callers retain the original truncation contract unless explicitly opted in.

The financial schedules now use staggered off-hour recovery opportunities every three hours. A lightweight London-date check skips re-collection once today's successful source covers yesterday; failures and stale coverage retry. Manual dispatch still forces collection; publication switches and rollback approval gates are unchanged. GitHub's scheduler can still delay jobs, so this improves recovery opportunities rather than guaranteeing a wall-clock deadline.

Recovery exposed overlapping Pages publications: a cancelled older build briefly appeared as `errored`, causing false failure reports despite a successful newer deployment. The publisher now observes the latest deployment until its existing bounded deadline, retrying one persistently errored queue once and requiring the requested Git ancestry and exact served snapshot/manifest/status before success. Persistent errors and mixed served bundles still fail.

## Validation

- Financial/marketplace/growth suite: 198 tests, 194 pass, 4 intentional private-evidence skips, zero failures.
- Native reconciliation: 42 source controls; generated reconciliation files restored after checking.
- Reporting calculations: 12 pass; reporting contract: 18 pass; rendered date controls: all 11 presets across three selectors plus custom inputs.
- Chart and new comparison regressions: 13 pass, including archive gaps, workbook exclusions, count policy, full-FY rounding, leap days, unequal calendar positions, zero denominators and next-day staleness.
- Ads and Insights checks pass.
- Real Chrome, real 10-11-2026 clock (no previous-day clock freeze): current YTD £273,545.01; Last 30 days £26,008.45; This month £9,561.63; current FY £80,432.01. FY26 remains £398,139.18 with all 12 YoY and MoM comparisons available. Rolling-year edge comparisons use selected dates. Existing FY17 historical presentation remains available. No page errors, year-first visible dates or mobile page overflow.
- Existing imported purchased-unit coverage remains independent: genuinely unverified source-day gaps can still withhold units growth; financial comparisons do not use units as a replacement count.

Claude confirmed both root causes and reviewed the staged calculation/accessor changes without blocking defects. Its scheduling finding was addressed by staggering the feeds, and its Pages retry concern was addressed with one bounded rebuild retry. An optional-accessor fallback was also added. Claude’s final corrected-diff verdict: “Sound — approved for release.” It verified the staggered schedules, bounded Pages retry, historical fallback and exact calendar matching. Two cosmetic suggestions were explicitly non-blocking. Hosted and public-deployment verification are recorded in the release handoff.
