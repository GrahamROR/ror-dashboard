# P1/P2 daily financial publication — release gate

12 October 2026. Approval-gated implementation in PR15. No merge, deployment, production data write or finance activation was performed. `FINANCE_PUBLICATION_ENABLED` is absent from repository Actions variables. Pages currently serves `main` at `/` using its legacy branch build.

## Implemented publication

The existing 03:00 UTC daily workflow first refreshes and publishes `data.json` as before, then invokes the validated canonical Shopify collector **only on main and only when `FINANCE_PUBLICATION_ENABLED=true`**. No additional scheduled writer was added. The original Ads, Email, LTV/CAC and ROR Sales producers and schedules are preserved; their commit steps use the same publisher. Manual legacy/Ads backfills share their corresponding writer's concurrency group.

The publisher owns an explicit file allowlist. It constructs a commit on the newest remote parent without modifying the checkout, rebasing stale exports or force-pushing. Independent export changes survive. A changed owned file, finance producer or canonical pointer/status aborts stale publication and requires a fresh run. Push retry is bounded to three attempts; a lost acknowledgement is verified by fetching the actual remote bytes. Git failures never become false success.

A successful finance commit contains the immutable snapshot, its content/byte-hash-checked manifest and matching refresh status together. Source identity, GBP/London dates, every covered day, independent monthly/period controls, product controls and money/order bridges must pass. The collector re-queries retained history for late refunds and adjustments into a new immutable snapshot. Failed collection/validation publishes warning metadata against the old snapshot; it never selects the candidate. All earlier snapshots remain available. Raw captures and credentials are excluded from Git publication.

Workflow-token commits do not trigger branch-based Pages builds automatically. Every approved main export publisher therefore requests a Pages build explicitly using `pages:write`, waits for a build containing its confirmed Git revision, and checks the served manifest, snapshot hashes and status against the built Git tree. A newer unrelated export revision is acceptable when it contains the publication and a coherent finance bundle. Build/API/CDN timeout leaves valid Git data intact and fails the Action; it does not claim the website was updated. No real Pages build was requested in staging tests.

References: [GitHub Pages publication source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [supported Pages build request](https://docs.github.com/en/rest/pages/pages?apiVersion=2022-11-28#request-a-github-pages-build).

## Freshness and failures

Both original dashboards poll the shared integrity-checked finance loader every 15 minutes without resetting selected dates, financial basis or Growth controls. Missing/mismatched status, failed refresh and rollback have explicit warnings; covered, verified amounts remain visible. Uncovered dates and comparisons remain withheld under the existing P2 rules. London coverage should reach yesterday: older coverage is pending before 08:00 London and stale from 08:00. The existing daily schedule stays 03:00 UTC (04:00 BST / 03:00 GMT).

Collection/publication/build failures make the workflow red and retain audit artifacts for 30 days. The owner should watch Actions notifications and confirm the latest daily run plus public status/manifest identity. If Git or Pages is unreachable, a new on-site failure message cannot be guaranteed immediately; the Action still fails and the independent coverage-age warning appears by the morning deadline. Rerun after transport recovery; recollect when owned paths or producer code moved. Do not force-push. Keep release audit artifacts in an approved private durable archive before the 30-day expiry.

## Exact approval-gated merge and activation order

1. Reconfirm current main and reviewed heads. Merge **PR14 → main first**, after approval. PR14 is currently `011e7fbd356e1c0ae1d7baa7ad0ea1706ecd42cd`.
2. Retarget **PR15 → main** and update it to the resulting latest main while retaining P1/P2 work. Rerun compatibility, automated checks and staging if source/workflows changed. Approve and merge PR15 second. **Do not merge PR16** as part of this release; it remains independently gated. If PR14 is squash-merged, account for its changed ancestry when updating the stack rather than replaying duplicate P1 work.
3. Keep `FINANCE_PUBLICATION_ENABLED` absent/false during code release. Record the served main code revision, current snapshot ID/hash, status and all five export hashes. Confirm Pages has published the reviewed UI and the accepted snapshot; check the seven Growth tabs, ROR cards/table/contribution/Explorer, financial bases, dates, goals/sliders and marketing functions.
4. Only after **explicit production activation approval**, set repository Settings → Secrets and variables → Actions → Variables → `FINANCE_PUBLICATION_ENABLED=true`. Existing Shopify secrets remain unchanged. The approved workflow uses its built-in token with `contents:write` and `pages:write`; no new credential is needed.
5. Run existing **Fetch Dashboard Data** manually on **main**, with `rollback_snapshot` empty and `approve_rollback=false`. Equivalent approved command: `gh workflow run fetch-data.yml --ref main`. Confirm legacy export publication, canonical controls, matching Git bundle, successful Pages served-identity verification and the audit artifact. Check both dashboards using the same dates/basis and confirm All Stores remains imported gross.
6. Confirm the next ordinary scheduled cycle succeeds and finance coverage reaches London yesterday. No new cron or new finance workflow needs enabling. This first actual production cycle/Pages request is necessarily post-approval and has not been performed here.

## Exact rollback and recovery

1. Set `FINANCE_PUBLICATION_ENABLED=false` (or remove it). An already-running job retains its original environment: let it finish or cancel that active Fetch Dashboard Data run before proceeding. Other daily export workflows remain operational.
2. Record the current pointer and choose a validated snapshot **already retained on main**; never reconstruct historical figures. Run Fetch Dashboard Data on main with `rollback_snapshot=<retained 64-character ID>` and `approve_rollback=true`. Equivalent approved command: `gh workflow run fetch-data.yml --ref main -f rollback_snapshot=<ID> -f approve_rollback=true`. The rollback is rejected while finance is enabled or without explicit manual approval.
3. The publisher selects the retained snapshot and matching manifest/status in one commit, explicitly marks rollback/paused status and verifies the Pages bundle. It leaves newer financial snapshots and every unrelated export intact. Confirm restored figures and warnings in both original dashboards.
4. For a UI/code fault, prepare a narrowly scoped reviewed revert of the responsible code only; do not restore all of main or revert newer daily exports. Record any matching manifest/status adjustment. Source history and raw evidence require no mutation.
5. Fix and rehearse in staging. With separate recovery approval, enable the flag and run a fresh validated collection; do not merely erase a warning or replace source amounts. Verify the served coherent bundle and next scheduled cycle again.

## Readiness and limits

P1/P2 are ready for owner-approved release. No known coding or staging-validation blocker remains; production activation remains explicitly approval-gated. The actual production Pages request and first scheduled publication are acceptance checks after approval, not claimed as staging deployments. Native Shopify definitions/tax treatment remain unchanged; commercial net sales are not asserted to be VAT-exclusive accounting turnover. The known two-order legacy/native difference remains documented and is not balanced away. Etsy, NOTHS, StockHub and Xero are outside this change.

Detailed automated, live-source and browser results are recorded alongside this checklist.

## Verified results

- Latest main: `02e2f3c750acaefaebbca733e62efa9cd44910fd`; reviewed implementation: `ebe44681ee9b54d4d2eb03db00ce15dc81b7abfb`. P1 and P2 both form conflict-free compatible trees. P2 tree: `13fd47a483f34492afd2b3b7cd0a21dfdfbd32ea` (the staging PR merge checkout has the same tree after combination with main). Later documentation-only commits do not change tested implementation bytes.
- P1 latest-main: all five original test-file runners passed. P2 branch: 55 Node harness entries passed. P2 latest-main: 53 passed, two private-source fixture skips, zero failures. The omitted private-capture cases are supplemented by the real staging collection and native-control validation. Workflow YAML parses successfully. All five original protected branch exports remain byte-identical.
- [Credential-backed staging run 38303469192](https://github.com/GrahamROR/ror-dashboard/actions/runs/38303469192) passed all steps. [Reporting CI run 38303469355](https://github.com/GrahamROR/ror-dashboard/actions/runs/38303469355) passed. Staging token has repository contents-read permission only; no real Pages request or production Git push occurred.
- Latest source collection started 20:19:39 UTC, completed 20:22:20 UTC. Coverage: 1 January 2024–11 October 2026, 1,015 days, 41 independent native period controls. Snapshot `15e8e6be5ea622f19c7abeca19a1ddfb7c3aca686690bdf05c54bd7f9b86b620` was independently rehashed and validated after downloading the audit. Daily, period and product financial arrays are identical to the accepted snapshot; provenance changed only. Source `taxesIncluded=true` is preserved; this does not establish VAT-exclusive accounting turnover.
- The exact publisher rehearsed an atomic three-file bundle, a racing independent Ads update, failed collection with warning-only publication, a second **real credential-backed** recovery, and rollback to the retained accepted snapshot. All existing immutable snapshots and unrelated exports survived. Recovery snapshot: `3a97fe308155dbe452dd10d8bac44ecb1e6e55d7fc46ffb71365476a0b24db8e`. Git/served Pages verification was simulated with the real captured finance bytes and an exclusively local bare remote. Unit tests also cover refused/repeated pushes, lost acknowledgements, changed owned paths/producer code, valid-hash incomplete/control-mismatched snapshots, Pages permission failures/timeout/mixed served bundles and activation/rollback guards. Live Shopify GraphQL throttling recovered with bounded backoff, including waits up to 32 seconds.

| FY26 metric | Latest verified source | Growth | Shopify-only ROR Sales |
|---|---:|---:|---:|
| Gross merchandise sales | £276,221.01 | £276,221.01 | £276,221.01 |
| Net merchandise sales | £247,999.66 | £247,999.66 | £247,999.66 |
| Shopify total sales | £313,437.06 | £313,437.06 | £313,437.06 |
| Eligible orders | 7,832 | 7,832 | 7,832 |
| Net AOV (rounded) | £31.66 | £31.66 | £31.66 |
| Native Shopify AOV | £32.22 | £32.22 | £32.22 |

July remains £11,619.67 net / £15,416.27 total / 445 eligible orders. Original frozen Growth export was £11,161.42 net / £14,807.43 total / 426 orders; canonical corrections remain separate from that historical export. See the retained full [before/after reconciliation](../reconciliation.md).

Browser checks used an isolated compatible latest-main copy, then the freshly downloaded credential-backed snapshot. All seven Growth tabs rendered without browser errors. The modeller slider changed its projected value, the goal lock toggled, and all three revenue bases left the £500k Total Sales goal unchanged. All three ROR date selectors worked for current/previous FY, this/last month and rolling 30/7 days; their shared full preset contract and custom calculations are covered by automated tests. Comparison tables, previous-year Explorer and contribution donut/bar/stacked-bar worked. Desktop and 390px mobile layouts retained their original controls; mobile page width stayed within viewport. Failure warnings appeared in both original dashboards with FY26 net/orders retained; loading the fresh successful capture cleared them. No separate finance interface or new navigation appears.

All Stores still reports **£466,955.48 / 12,680 / £36.83**, with legacy imported gross labels, contribution and Explorer retained. Etsy/NOTHS financial calculations were not changed. StockHub and Xero were not touched. Screenshots, browser observations, test logs and the independently validated source/simulation report are in this directory.

Remaining acceptance gates are owner approval, ordered merges and the explicitly approved first production Pages/publication cycle. The two-order difference between imported history and native Shopify eligibility remains visible in the original reconciliation and does not change canonical native figures. There is no new financial adjustment or unexplained financial-array change to approve from this refresh.
