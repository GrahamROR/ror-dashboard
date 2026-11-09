# ROR Sales: coverage explanations and compact period labels

Prepared on 9 November 2026 against `main` at `27fd23b` in the linked project folder, `Documents/AI Projects/Rock-On-Ruby/ror-dashboard`. Prepared for pull-request review; changes have not been deployed.

## Changes

- Section period notices display the aggregate's explanation in the page, including the missing marketplace channel and last covered date. The existing section-level full date summary is preserved.
- Unavailable or partial KPI cards offer a native **Coverage details** disclosure. The full explanation is available by click, touch, or keyboard without relying on hover, and wraps within the card.
- Channel contribution uses the aggregate's coverage explanation, with the previous generic message retained as a fallback. Shopify's available channel row remains visible while incomplete combined totals and shares stay withheld.
- Sales comparison rows show the short bucket label plus any existing `incomplete period` flag. Exact bucket endpoints remain in the cell's `title`.

Only `dashboard2/ror-sales-app.js` changes application behavior. Management aggregation, source validation, publication gates, collectors, workflows, snapshots, and daily exports are unchanged. `ManagementFinance.aggregate()` continues to expose the channel warnings through `note`; no finance logic change was needed.

## Validation

- JavaScript syntax and `git diff --check`: pass.
- Desktop (1440px) and mobile (390px) browser checks: pass; no JavaScript page errors or horizontal mobile overflow, including with an expanded disclosure.
- Disclosures open with a click and toggle using Enter. Marketplace reasons and cutoffs appear as page text, not only attributes.
- All six comparison granularities retain compact visible labels and full date titles. Incomplete flags remain.
- FY26 All Stores Net Sales remains **£398,139.18**. For current FY through 8 November, Shopify-only Net Sales remains **£56,372.56**; All Stores management Net Sales remains withheld; explicitly selected Legacy imported gross remains **£87,578.38**. These checks used a fixed browser clock of 9 November 2026.
- CI finance/marketplace/growth suite, with the same checked-out export and artifact hash baselines as CI: **121 pass, 2 fail, 4 skipped** (127 tests). Both failures also reproduce on an untouched archive of `27fd23b`; see below.
- Finance reconciliation: **42 native control periods reconciled, 130 comparison rows**. Run in a disposable archive of the same commit because this command writes historical reconciliation reports; existing project reports were preserved.
- Dashboard calculations, reporting contract, date controls, Ads tests, and Insights tests: pass.
- SHA-256 verification confirms all five daily exports and all tracked Shopify/marketplace staging files are unchanged.

Browser evidence is in `browser-results.json` and `screenshots/`. Automated output is in `reporting-tests.txt`, `additional-tests.txt`, `main-foundation-tests.txt`, and `reconciliation.txt`. The first in-place reconciliation attempt lacked sandbox write access; the disposable-archive run passed as recorded above.

## Items for Claude / owner follow-up

1. **Two existing tests have outdated gross-shipping assumptions.** `finance/test/foundation.test.js:9` and `:11` expect Shopify FY26 gross including shipping to be `null`; the current active snapshot returns **£300,105.51** from validated components. The same failures occur on untouched main. Update the tests/fixture separately while retaining a real missing-or-unvalidated-shipping case; do not change source data to satisfy the old assertions.
2. **Marketplace reconciliation still needs new source evidence.** Current snapshot coverage ends on **31 July 2026 for NOTHS** and **30 September 2026 for Etsy**. Refresh requires the source CSV/control evidence and the existing reviewed promotion process. No automatic refresh or snapshot promotion was added. Until reconciled coverage is current, the combined management total correctly remains unavailable; the UI now explains why.

The other older checkout under `Documents/AI Projects/Codex/...` contained unrelated uncommitted work and was left untouched.
