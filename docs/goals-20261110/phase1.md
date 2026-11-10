# Phase 1 — ROR Total monthly goals

The new collapsible ROR Total card uses the existing current-FY goal variables and shared `GrowthTargets.plan`/`FinancialGoals.annual` maths. It remains All Stores Net Sales regardless of the page’s selected store, basis or period. The 12 monthly rows show actual, seasonal target, signed variance, source orders and status, followed by the existing gated YTD actual.

The on-page disclosure explicitly says the seasonal shape was calibrated on Shopify and is not separately tuned for marketplaces. Future months have no actual or variance. Missing financial coverage stays unavailable; it never becomes zero or an underperformance verdict. “Verified days” appears only for a complete financial aggregate.

The reporting cutoff deliberately uses the existing current-FY requested end (London yesterday), instead of the spec’s suggested imported `meta.latest`. That metadata describes a separate units pipeline; letting it set the financial target would silently hide valid or missing financial days. Claude independently confirmed this correction. Source completeness remains exclusively controlled by the unchanged management aggregator.

Validation: full `node --test` with fresh protected export/financial baselines: 230 total, 226 pass, four intentional private-evidence skips, zero failures. Four new goals tests cover direct aggregate parity, YTD reconciliation, missing-day nulling, future dates and rendered disclosure/verified-day text. Real-date Chrome checks verify lazy mounting, 12 rows, YTD £80,432.01, independence from historical/FY/store/basis filters, DD-MM-YYYY dates and mobile layout. The pre-change unconfigured suite has two documented stale-baseline failures; no baseline expectation files or source data are changed.
