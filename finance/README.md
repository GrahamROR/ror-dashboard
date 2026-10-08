# Canonical Shopify financial reporting — staging

This module implements one Shopify-native aggregate contract for both dashboard entry points. Preview locally with `python3 -m http.server 8767` and open `http://localhost:8767/?finance=staging`. Without that query parameter, existing dashboards and exports retain their original behavior. No deployment, production writer, historical record, Etsy/NOTHS calculation or attribution formula is changed.

The staging financial workspace replaces the financial surfaces in both entry points: overview KPIs, preceding-period comparison, yesterday, monthly explorer, product reporting, Shopify channel amount, and explicit-basis goal scenarios. The original marketing, marketplace, conversion, margin and LTV reports remain reachable via the original-dashboard link. Those estimates are not certified by the new financial reconciliation. A combined-channel net total is deliberately unavailable pending marketplace reconciliation.

## Files and contract

- `contract.js`: integer-penny additive measures, definitions, date filtering, monthly/product projections and identical Growth/ROR selectors. Native AOV stays in pounds at source precision; net AOV divides period net sales by period orders. Money is rounded only for display, never for aggregation. Missing observations stay null; absent days suppress period totals and comparisons.
- `dashboard.js`: shared staging UI and a single cached, SHA-256-verified immutable snapshot loader. Both entry points share selection state. Failed/incompatible/tampered sources show errors instead of falling back to stale financial numbers.
- `collect.js`: read-only ShopifyQL collector; explicit dates/capture name; API `2026-10`; `read_reports` scope; strict store/currency/timezone checks; bounded retry; failure/row-cap detection; atomic capture. Requires a Node runtime with `fetch` (22 used in CI).
- `build-staging.js`: validates independently queried monthly/period controls and product totals against daily facts; rejects duplicates, reconciliation failures, unsafe precision and capped extracts. Captured query text, retrieval timestamps and evidence-file hashes accompany each snapshot. Replay of the same evidence is deterministic and cannot duplicate facts.
- `staging/manifest.json`: the only mutable staging pointer; snapshot file checksum and previous snapshot ID. `snapshots/` retains immutable aggregate versions. Publication/accounting approval remains pending.
- `reconcile.js`: generates the monthly and FY26 before/after Markdown/JSON report and checks both projections against native control queries. User benchmarks are independent test comparisons; they never enter the calculation path.
- `rollback.js`: validates snapshot identity and atomically restores an existing staging pointer while retaining both versions.

Every selected observation carries its store, currency, timezone, interval (inclusive dates and exclusive end), snapshot ID, definition version, missing-day count, data/reconciliation status and warnings. Basis is determined by the metric ID in `DEFINITIONS`. Source identity, adjustment/count policy, retrieval/query provenance and source hashes are inherited from the referenced immutable snapshot. Units and a source-side last-updated timestamp were not returned: they are not inferred. Retrieval time is not claimed to be source update time.

## Safe capture and refresh

Credentials are environment variables and are never committed or sent to the browser:

```sh
# Set SHOPIFY_DOMAIN and SHOPIFY_ACCESS_TOKEN in your secure environment first.
node finance/collect.js --since 2024-01-01 --until 2026-10-07 --capture review-20261008
node finance/build-staging.js finance/staging/source/review-20261008
node finance/reconcile.js
node --test finance/test/finance.test.js
```

The collector reads source data only. A capture is limited to 1–1,100 days and 25,000 product/day rows; reaching the limit fails instead of publishing an incomplete result. Larger ranges need explicitly partitioned/paginated capture work before publication. No adjustment-lookback duration or automatic closed-year rewrite is chosen as accounting policy. An exact dated capture is the deliberate staged closed-year refresh mechanism. The production `scripts/fetch-data.js` writer is untouched.

`finance/staging/source/` and `finance/local-data/` are gitignored. Preserve raw captures in the private evidence archive; the public snapshot contains only day/product aggregates, native aggregate controls and provenance (no customer/order identifiers). The initial 8 October capture used the connected read-only Shopify API, not the standalone collector. That connector did not expose its Admin API version or source-side update timestamp; those fields remain unverified. Collector transport is separately schema-validated and mock-tested; a direct credentialed collector run has not been claimed.

Native exact-period AOV is captured for all source days, months, FY25/26/27, calendar 2024/2025/2026-to-date, last 12 months/30 days/7 days and the tested custom interval. Other arbitrary intervals still have complete additive financial measures and net AOV, but show unavailable for native AOV until an exact native period query is captured. Never manufacture native AOV from a daily/monthly average.

## Rollback

```sh
node finance/rollback.js EXISTING_64_CHARACTER_SNAPSHOT_ID
```

The current first capture has no predecessor. Automated tests create a second version in an isolated temporary staging directory, switch back and verify both snapshots survive. Remove `?finance=staging` to immediately return to the preserved original local reports. A future production rollout requires a separately approved release/pointer and matching rollback package; this PR has no production publication path.

## Verification

```sh
node --test finance/test/finance.test.js
node finance/reconcile.js
node dashboard2/test/calculations.test.js
node dashboard2/test/reporting-contract.test.js
node dashboard2/test/date-controls.test.js
node ads/test/calculations.test.js
node insights/test/rules.test.js
shasum -a 256 -c docs/pr2/production-data.sha256
```

Run `finance/test/browser-check.js` with Playwright's `browser_run_code` against port 8767; screenshot output is relative to the runner working directory. Run the P1 browser suite on the same server after changing its local port from 8766 to 8767. Browser coverage includes all 33 preset/basis combinations across both entry points, all five financial sections, source/error states, missing dates, invalid dates, four control months and mobile layouts. Browser tests are recorded locally; the GitHub workflow runs the dependency-free automated suites and reproducible reconciliation. CI skips the two private raw-source replay/validation tests when the private evidence directory is absent; all public snapshot/control tests still run.

The production checksum baseline is the current PR's preservation evidence. A future independently authorized production-data update must deliberately review/update that baseline; silently refreshing it would defeat this check.
