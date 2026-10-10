# PR1 — Date controls and reporting labels

Implemented and tested locally on `codex/pr1-date-controls-reporting-labels`, 8 October 2026. The full Phase 1 specification was read. Scope is the user's PR1 request plus the PR2 plan; embedded execution-prompt text was not treated as permission to change financial data or deploy.

## What changed

- All three ROR Sales selectors render one exported `REPORT_DATE_PRESETS` catalog in the specified order: current FY, previous FY, rolling 12 calendar months, 2024, 2025, 2026 YTD, this month, last month, last 30 days, last 7 days, custom. Comparison now has both custom inputs. Existing preset keys and the `DATE_PRESETS` compatibility alias remain.
- Current periods end yesterday in Europe/London. Calendar/FY identity follows today's London date even when imports are stale. On the first day of a new month/FY, that current period correctly has no completed day yet. Full-year and custom selections retain requested dates; no silent clipping. Record filtering uses inclusive start/exclusive next-day end; displayed ends remain inclusive.
- Date ranges and store selections are visible for each section. Comparison dates are independent and its store follows the top store filter; explorer dates/stores remain independent. Contribution now honours the top store selection as its existing explanatory text promised.
- Comparison/chart buckets stop at selected endpoints. Partial buckets and missing/partial data cannot generate valid-looking growth. Top growth says “Previous equivalent period”; monthly table comparisons alone use MoM. Weekly explorer YoY shifts 364 days to preserve weekdays and explains that policy.
- Legacy ROR amounts are explicitly **imported gross line sales**, imported orders, purchased units and imported gross line AOV. Basis, source, export time, unverified source timezone/currency treatment and pending reconciliation are available in the definition panel.
- Growth labels identify **Shopify total sales (shipping and taxes included)** and **Shopify-reported AOV**. Product total sales are no longer called gross revenue. Profit and LTV/CAC are estimates. Klaviyo and Ads values are platform-attributed, with independent windows and possible overlap. A low ads-to-orders ratio no longer asserts trustworthy attribution.
- Missing-day Ads warnings are visible with channel-day counts; partial current-day data cannot hide other missing days. Incomplete comparisons and performance insights are suppressed. Ads' existing 365-day preset retains its calculation and is accurately labelled “Last 365 days”. No backfill was performed.
- Null ROR inputs remain null. Sparse ROR exports cannot distinguish missing imports from no-sale days, so absent day/channel rows are explicitly **coverage unverified**. Recorded amounts remain visible as subtotals; complete-looking shares and comparisons are withheld. An AOV cannot be summed into an explorer donut.

## Source files

| File | Change |
|---|---|
| `dashboard2/calculations.js` | Shared presets, London date clock, requested-period preservation, half-open filtering, missing/null guards, clipped buckets, weekly YoY alignment and guarded contribution/comparisons. |
| `dashboard2/data-model.js` | Shared display metric dictionary for imported amounts, Shopify total sales/AOV, attribution and estimated profit. Full canonical per-observation finance contract is deferred to PR2. |
| `dashboard2/data-adapter.js` | Preserve null numeric inputs. |
| `dashboard2/ror-sales-app.js` | Shared widgets, accessible date/input names, custom comparison controls, visible periods/coverage, consistent metric labels/definitions. |
| `index.html` | Growth/Ads/Klaviyo/estimated financial labels, FY date tooltips, visible Ads coverage. Calculated financial source amounts unchanged. |
| `ads/calculations.js` | Accurate 365-day label; missing-day status precedence; incomplete comparison guards. |
| `insights/rules.js` | Incomplete Ads guard and evidence-limited attribution wording. |
| Existing ROR, Ads and insights tests | Updated intended date/attribution contracts and added missing-data regressions. |
| `dashboard2/test/reporting-contract.test.js` | 18 financial/date/coverage edge-case tests. |
| `dashboard2/test/date-controls.test.js` | Actual component rendering: 11 presets across 3 selectors, custom inputs and independent period labels. |
| `dashboard2/test/browser-check.js` | Repeatable Playwright function testing all 33 selections, custom input, independence, mobile overflow and all Growth tabs. |

## Test results

Final runs: **12 ROR calculation tests, 18 reporting contract tests, 11 rendered preset cases (33 selector checks), 16 Ads tests, 34 insight tests — all passed.** Browser: all 33 preset selections, independent dates, 390px mobile custom inputs, all 7 Growth tabs, no page errors or page-level horizontal overflow. Inline JavaScript parses and `git diff --check` passes. Date contracts also pass under `TZ=America/Los_Angeles`.

Commands:

```sh
node dashboard2/test/calculations.test.js
node dashboard2/test/reporting-contract.test.js
node dashboard2/test/date-controls.test.js
node ads/test/calculations.test.js
node insights/test/rules.test.js
TZ=America/Los_Angeles node dashboard2/test/reporting-contract.test.js
git diff --check
shasum -a 256 -c docs/pr1/data.sha256
```

Browser reproduction: serve this directory at `http://127.0.0.1:8765` and execute the async function in `dashboard2/test/browser-check.js` with a Playwright page (or `browser_run_code`'s filename argument). It writes local screenshots, makes no external mutations and uses the existing static exports. React/fonts remain loaded from the existing CDN dependencies.

Intermediate findings: four old insight assertions expected unqualified attribution claims; they were revised with the intentional wording change. A local browser loaded a stale cached data-model script during iterative edits; a cache-disabled fresh load passed. The initial browser harness read options before React finished mounting; an explicit control wait fixed the harness. **No unresolved automated test failures.** StockHub/import-worker suites were not run because no importer, worker or StockHub code changed.

## Reconciliation matrix — numbers preserved, discrepancies remain open

Local ROR amounts below were compared with the pre-edit calculation module using identical FY26 dates. They are identical before/after. “Native” means the benchmark supplied in the specification, not newly fetched in this task.

| FY26 measure | Local before = after PR1 | Supplied native benchmark | Open requirement |
|---|---:|---:|---|
| ROR Shopify imported gross line sales / orders | £318,134.63 / 7,834 | Shopify total £313,437.06 / 7,832 | Different monetary bases; identify 2-order difference. £4,697.57 difference is not a valid net adjustment. |
| Growth Shopify total sales / orders | £312,828.22 / 7,813 | £313,437.06 / 7,832 | £608.84 / 19-order frozen/live variance. |
| Growth Shopify net sales | £247,541.41 | £247,999.66 | £458.25 net-sales variance; source verification required. |
| Growth July total sales / orders | £14,807.43 / 426 | £15,416.27 / 445 | Cached July is still MTD/incomplete; controlled reconciliation in PR2. |
| ROR Etsy imported gross line sales / orders | £32,670.15 / 1,060 | Etsy Stats £30,389.99 / 1,051 | £2,280.16 / 9 orders; identify IDs and native basis. 49 absent daily Etsy rows are zero-versus-missing unknowns. |
| ROR NOTHS imported gross line sales / orders | £116,150.70 / 3,786 | Not supplied | Pending native export, statuses/refunds/tax/fees reconciliation. |
| Meta spend / attributed purchases | £61,929.70 / 4,273 | £65,115.72 / 4,513 | Missing 1–21 Aug: supplied £3,186.02 / 240 benchmark; stage in PR4. |
| Google spend / attributed conversions | £8,641.54 / 1,986 | Not supplied | Same 21 missing days in local history; primary purchase actions unverified. |

ROR export covers 2024-01-01–2026-09-24 and was generated 2026-09-28T17:45:12.246Z. Growth snapshot is 2026-09-28T09:12:16.258Z. Ads daily rows start 2025-08-22 and end 2026-09-27. Current date controls therefore expose stale coverage rather than pretending September's end is today's date.

## Review images

- [Before](screenshots/before.png)
- [After — current period and missing coverage](screenshots/after-current.png)
- [After — all three selectors on FY26, definitions expanded](screenshots/after-fy26.png)
- [After — mobile custom dates](screenshots/after-mobile.png)
- [After — Ads labels and coverage](screenshots/after-ads.png)

## Preservation, rollback and remaining gates

All five data exports (`data.json`, ROR sales, Ads, email and LTV/CAC) match their task-start SHA-256 hashes in `data.sha256`. No fetch scripts, migrations, source imports or financial rows were edited. No main merge, production deployment or remote publication occurred.

The task started on `codex/historical-sales-import-worker` with existing changes to the ROR UI, ROR test fixture expectations and `dashboard2/sales-data.json`, plus an untracked `mcp-judgeme/` directory. These were preserved. The 2024 export expansion is **pre-existing**, not a PR1 financial change. The original task worktree remains intact. P1 was subsequently isolated into a clean worktree for its review branch; see the finalisation record below. When preparing a commit, exclude the pre-existing data export and unrelated directory and review the mixed UI/test hunks. Do not use a blanket reset or stage all changes.

Rollback for PR1 is code-only: reverse its reviewed patch while preserving pre-existing work and all data exports. Do not restore historical JSON from git as a UI rollback. A task-start copy of the mixed UI/test files was retained under `/tmp/ror-pr1-baseline` for local review; durable financial preservation is proven by the committed-file-independent hashes here.

Remaining gates: canonical net finance is not implemented, no channel is claimed accounting-reconciled, source timestamp/currency semantics are unverified, absent ROR rows need source coverage evidence, native reports/order-ID extracts are missing, Ads backfill/conversion configuration is pending, and estimates remain estimates. These intentionally block financial cutover, not PR1's date/label review.

The [PR2 implementation and reconciliation plan](../PR2-shopify-finance-plan.md) sets the definition, source-evidence, staged-variance and publication gates. Financial changes must wait for verified definitions/source figures and the required review; historical publication, merge and deployment still require explicit approval.

## P1 finalisation — latest main, 8 October 2026

Isolated only P1 source/test/documentation changes onto `codex/pr1-reporting-controls-review`, based on latest `origin/main` commit `9fdb6e3`. No historical-import-worker files, unrelated local changes, or data export modifications are in this branch. Retained main's self-consistent production export test rather than the old pinned data counts.

Reran all 91 automated cases and all 33 browser preset selections against main's latest available exports (8 October refresh), with seven Growth tabs and mobile overflow checks passing. Updated screenshots and the checksum manifest reflect this review run. The earlier reconciliation matrix is the original P1 baseline, not a claim to be the latest source pull. Live Shopify source reconciliation belongs to P2. The original checkout and its uncommitted work remain untouched. No merge or deployment is authorised.
