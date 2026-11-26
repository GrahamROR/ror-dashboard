# Reporting views

The four views are available within both existing dashboard entry points:

- **Commercial** is the original dashboard and remains the default. Its component is always mounted while changing reporting views.
- **Financial** shows management sales, matching source counts, exact-ratio arithmetic, display-rounding drift and signed source components.
- **Native Analytics** preserves independent exact-period Shopify AOV and native source components. Sessions and rates require an exact source-matched capture; monthly data is never prorated.
- **Metric Comparison** presents the definitions side by side without changing the original dashboard's AOV, targets or modelling.

`app.js` owns reporting navigation and the separate reporting filters. Financial, Native Analytics and Metric Comparison share those filters, defaulting to the previous financial year. Growth is Shopify-only; ROR Sales has a store selector. The original page, comparison and explorer filters stay independent. Each dashboard keeps its own new-report context. Original top-level dashboard-switch behaviour is unchanged.

`metrics.js` is a read-only projection over the existing daily financial snapshots and selectors. Source currency, timezone, coverage and confidence gates remain explicit. Earlier workbook history and archived comparisons stay in Commercial; the additional views require complete daily source coverage. Marketplace management assumptions and the fiscal penny allocation remain provisional and unchanged.

Sales in integer pence and matching source orders define an exact fraction. The decimal per-order display is an approximation. The arithmetic status does not independently prove source completeness or accounting correctness. Zero orders produce no per-order identity, including refund-only periods. NOTHS source-component residuals remain visible and are never balancing adjustments.

Accounting reconciliation is separate and shown as not compared. There is no accounting service connection, private ledger data, authentication token, new export, source capture or data-publication change in this feature. Existing goals, the £48 target, What-If tools, CSS block and public exports are unchanged. Only the reporting-check workflow adds the new pure tests and their path trigger.

The original dashboard sits outside the new reports' React error boundary. New report contents and their optional Shopify marketing capture load only on first entry. Returning to Commercial preserves its controls and restores its scroll position. The new tab bar supports arrow keys, Home and End, with inactive panels removed from keyboard navigation.

## Validation

Run the existing reporting suites with freshly captured export/financial baselines, as `.github/workflows/finance-tests.yml` does, and:

```sh
node --test reporting/test/metrics.test.js
```

For browser acceptance, serve the repository on `http://127.0.0.1:8775/` and execute `reporting/test/browser-check.js` with Playwright's `browser_run_code`. It checks retained original DOM/state, all seven Growth tabs, all five explorer chart types, new date presets, both dashboards at desktop/mobile widths, precision, native AOV, keyboard/scroll behaviour and isolated render/fetch failures. It does not write screenshots or data files.

The baseline on current main exposed an existing goal test that removed the newest NOTHS day, even when that day was outside its fixed reporting period. The fixture now removes its selected cutoff date explicitly. No production goal code was changed.

No merge or deployment is part of local validation.
