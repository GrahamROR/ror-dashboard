# Ads and LTV:CAC reliability corrections

This review branch changes reporting safeguards, not revenue definitions, attribution settings or financial source records. Private platform captures, staged backfill and accountant evidence are kept outside the public repository.

## Before and after

- Ads Last 7/30 Days included today although imports stop at yesterday. They now cover the previous 7/30 completed London days. Today remains separate and partial. Civil date arithmetic uses UTC to avoid host-timezone/DST errors, while today's reporting date uses Europe/London.
- Missing conversion/value/click/impression fields could be coerced to zero and marked complete. The affected metric and derived ratio are now unavailable, and comparison is withheld. Real zero values remain valid.
- Blended CAC could use only one platform's spend. Both platforms are now required, including a browser guard for retained old incomplete exports. Missing customer/cost months also cannot manufacture proxy inputs.
- Google fractional attributed conversions were rounded during fetching. Daily and historical fetchers now preserve returned precision; the existing Ads components display fractional conversions. Existing historical days are not rewritten.
- Missing daily-fetch credentials previously returned a truthy null-valued record that could replace last-good data. Missing credentials now retain the existing record, matching transport-failure behavior.
- The original Margin components now describe estimated gross-profit LTV as a period proxy, disclose monthly customer counts without deduplication and legacy native AOV, and avoid asserting a below-one proxy means accounting losses. No cohort methodology was introduced.

## Staging and promotion

`ads/stage-backfill.js` creates an idempotent, channel-specific candidate from supplied source evidence, preserving existing validated days and rejecting duplicate/missing source financial fields. It does not fetch, publish or write production data. No candidate rows or platform identifiers are committed here. Historical promotion needs separate source/control reconciliation and approval; missing platform evidence remains missing.

## Regression checks after production finance activation

The full initial test run found stale financial-fixture timestamps, a replay test rewriting the real checked-out manifest, and preservation assertions pinned to the pre-activation snapshot. Replay now runs in a temporary directory; publication test dates derive from the accepted snapshot's coverage. CI records current financial hashes before testing and verifies preservation, without changing historical evidence baselines. The reconciliation generator checks current native controls; CI no longer requires a newly refreshed report to equal a dated pre-activation report. Source records and production workflows/schedules are unchanged.

Full Node regression run: 77 passed, 2 private source fixture skips, no failures. Ads audit tests also run under a non-London host timezone. Real native Meta reconciliation and Google evidence limitations are documented privately. Fresh visual browser checks remain blocked by unavailable approved CUA tooling; no new screenshots are claimed. Retained earlier screenshots establish prior design review but are not a substitute for fresh visual acceptance.

No merge, deployment, source mutation, platform settings change, new workflow activation, P3/StockHub/Xero modification, or historical backfill publication.
