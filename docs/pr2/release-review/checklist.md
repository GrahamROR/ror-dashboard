# P1/P2 release and rollback review — 12 October 2026

**No merge, deployment, production write or workflow activation.** GitHub Pages is configured to publish main at repository root; writes/merges to main can trigger publication and must remain approval-gated. The three PRs are stacked: PR14 → main; PR15 → PR14 branch; PR16 → PR15 branch.

## Current readiness

Latest main is `02e2f3c750acaefaebbca733e62efa9cd44910fd`. Read-only merge-tree compatibility checks produce conflict-free trees for P1, P2 and P3; these are isolated exported trees, not branch merges. Latest five daily exports were used in tests.

P1 (`011e7fbd`) passes all five original test-file runners against latest main, covering ROR calculations, reporting contracts, rendered date controls, Ads and insights. No GitHub reporting workflow is configured on P1 alone; do not claim an absent remote check passed.

P2's latest-main run initially failed four tests: a baseline pinned to the old five exports and three fixtures assuming the old partial/marketing date. The previously tested P3 repairs are now also on the P2 branch: explicit partial/marketing-date fixtures and an optional explicit review-only export baseline. No product/financial implementation changes were made to satisfy those tests. Original protected export baseline remains unchanged. P2 branch: 43 Node test entries passed. Latest-main isolated tree: 41 passed, two private-evidence skips, zero failures. Original branch exports remain byte-identical.

## Daily verified-finance publication gate

**Not yet production-ready as an automatically refreshing finance release.** Existing scheduled `fetch-data.yml` runs the legacy fetch and commits **only `data.json`**. It does not invoke `--finance-staging` or publish `finance/staging` files. The separate canonical-finance workflow is staging-only, has no schedule, has repository contents-read permission and uploads an audit artifact. Passing it proves source collection, local validated publication and rollback; it does not prove daily production publication exists.

The existing implementation checks store/GBP/London identity, re-queries retained dates for late changes, reconciles native daily/monthly/FY and product controls, publishes content-addressed immutable facts before atomically switching the local manifest, and preserves the old manifest on failed collection/validation. Loader checks snapshot hash/id/schema and fetches the pointer without cache. Safe local publication is established; a production Git/Pages writer still needs to be implemented/reviewed and rehearsed before enablement.

Do not launch P2 as “automatically updating verified finance” with only a one-time snapshot. P1 can be approved independently. P2's financial implementation is ready for review, with this remaining operational gate clearly separated from Etsy/NOTHS reconciliation. VAT-exclusive accounting turnover is not claimed; retaining native Shopify source tax treatment does not require relabelling it as accounting turnover.

## Approval-gated release checklist

1. Record then-current main, PR14/PR15 exact reviewed revisions and Pages deployment revision/settings. Re-run compatibility and affected tests if any change. After approval, merge/rebase the stack in order and retarget PR15 to main; do not accidentally include PR16. These operations are not performed during this review.
2. Record old/new canonical snapshot IDs, file/manifest hashes, all five current production export hashes and the complete rollback code revision. Archive source/validation artifacts in an approved durable private location; Actions retention of 30 days is not a durable source archive.
3. Pass a fresh real credential-backed staging refresh, native FY26/monthly controls, July correction, date coverage/missing/partial checks, both original dashboard financial bases and isolated rollback. Capture a before/after history diff; investigate any late source adjustment instead of balancing to benchmarks.
4. Prepare and review a **disabled** production-finance writer before approval: use the same collector/validator, through London yesterday; allow enough time for throttling; serialize canonical writers; require complete capture/reconciliation and a protected-export diff gate. Commit only validated immutable finance files plus matching manifest/status **in one Git commit**. Upload a complete evidence artifact independently of publication. Never publish source credentials or raw customer data.
5. Rehearse that exact writer against an isolated repository/static output. Verify it cannot mutate the five imported exports, cannot publish a pointer without its snapshot, retains last-good on API/control/git failures, and rolls back code/manifest/status coherently. No production schedule can be enabled until this rehearsal and approval. This document is a proposed configuration checklist, not an installed/active writer.
6. For a moved Git branch, never force-push or blindly replay a stale financial pointer after rebase. Compare canonical paths to the starting revision; restart collection/validation if another financial publication moved them. Ordinary legacy-export changes must be incorporated without overwriting them. Maintain one publication owner and an explicit freshness/error status.
7. On approval, release reviewed P1/P2 code and its accepted finance snapshot as one coherent Pages revision; wait for the correct Pages build. Check original seven Growth tabs, ROR cards/table/contribution/Explorer, all date presets/bases, units, goals/forecasting, Email/Ads/Margin and current/partial coverage. Check snapshot hash/id and protected imports. Only then enable the explicitly approved finance schedule; keep existing non-financial daily jobs operational.
8. Verify one real scheduled cycle reaches the published pointer and both dashboards, with source date/freshness and controls intact. This final production check is necessarily after approval; it has not been performed or claimed here.

## Rollback checklist

- Pause only the new canonical writer if enabled; retain the existing legacy exporters. Keep all immutable snapshots and audit artifacts.
- Restore the exact retained UI/calculation revision **and matching canonical manifest/status** in one reviewed Git commit. Retain the new immutable snapshot for investigation. Do not roll back unrelated newer exports or all of main indiscriminately.
- Wait for Pages to serve that rollback revision, verify hash/id and the same selected-period figures in both dashboards, current/partial warnings, all original tabs/tools, and compare all five exports to the recorded protected baseline.
- Verify source credentials/StockHub/history require no change. Investigate in isolated staging before retrying; production rollback remains approval-gated.

NOTHS/Etsy work does not block independent P1 release or completing Shopify's production-writer gate. No StockHub change, Xero integration or production workflow activation is included.
