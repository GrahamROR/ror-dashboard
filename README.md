# Rock On Ruby — Growth Dashboard

Live dashboard served by GitHub Pages. Data pulled nightly from Shopify + GA4 via GitHub Actions.

This repo now holds **two dashboards** behind one "Shopify Growth | ROR Sales" switcher at the top of the page:

- **Shopify Growth** (original) — Shopify-only revenue, marketing, email and LTV:CAC reporting. Unchanged by the section below.
- **ROR Sales** (new) — consolidated commercial sales reporting across Shopify, NOTHS and Etsy. See [Dashboard 2 — ROR Sales](#dashboard-2--ror-sales) further down.

**URL once live:** `https://[your-github-username].github.io/ror-dashboard`

---

## File structure

```
ror-dashboard/
├── index.html                        ← both dashboards (served by GitHub Pages)
├── data.json                         ← generated nightly by GitHub Actions (multi-year — see below)
├── email-data.json                   ← generated nightly by GitHub Actions (rolling 90-day window)
├── ltv-cac.json                      ← generated nightly by GitHub Actions
├── ads-data.json                     ← generated nightly by GitHub Actions (daily Meta+Google, from first backfill)
├── ads/                              ← Shopify Growth's "Ads" tab calculations — see below
│   ├── calculations.js               ← date ranges, aggregation, comparisons — pure functions, unit tested
│   └── test/calculations.test.js     ← run with `node ads/test/calculations.test.js`
├── dashboard2/                       ← "ROR Sales" dashboard — see Dashboard 2 section below
│   ├── data-model.js                 ← shared constants: channels, financial-year math, granularities
│   ├── data-adapter.js               ← where sales records come from (today: demo-data.json)
│   ├── calculations.js               ← all the maths — pure functions, unit tested
│   ├── charts.js                     ← the one flexible SVG chart (bar/line/stacked/area/donut)
│   ├── ror-sales-app.js              ← the dashboard's UI
│   ├── demo-data.json                ← fictional demo/test data (safe to publish — see below)
│   └── test/calculations.test.js     ← run with `node dashboard2/test/calculations.test.js`
├── scripts/
│   ├── fetch-data.js                 ← fetches Shopify + GA4, writes data.json
│   ├── fetch-email-data.js           ← fetches Klaviyo + Shopify, writes email-data.json
│   ├── fetch-ltv-cac.js              ← fetches Meta/Google ad spend, writes ltv-cac.json
│   ├── fetch-ads-data.js             ← nightly: appends/refreshes the last 3 days into ads-data.json
│   ├── backfill-ads-data.js          ← ONE-OFF (manual): bulk-pulls ~400 days of history in one run
│   ├── build-demo-data.js            ← (re)generates dashboard2/demo-data.json
│   ├── import-sales-spreadsheet.js   ← LOCAL ONLY: real workbook -> local-data/ (gitignored, never committed)
│   └── package.json                  ← googleapis + xlsx dependencies
└── .github/
    └── workflows/
        ├── fetch-data.yml            ← runs daily at 6am BST
        ├── fetch-email-data.yml      ← runs daily at 6am BST, 10 mins after the above
        ├── fetch-ltv-cac.yml         ← runs daily at 6am BST, 25 mins after fetch-data
        ├── fetch-ads-data.yml        ← runs daily at 6am BST, 35 mins after fetch-data
        └── backfill-ads-data.yml     ← manual trigger only — run once to bootstrap ads-data.json's history
```

---

## Fiscal years — how `data.json` is structured

ROR's fiscal year runs **August → July**. `data.json` holds every fiscal year the dashboard has ever run, keyed by name, plus a pointer to whichever one is current:

```json
{
  "updated": "2026-07-27T06:00:00Z",
  "currentFY": "FY26",
  "yesterday": { "...": "yesterday's live snapshot, current year only" },
  "years": {
    "FY26": { "fyLabel": "Aug 2025 – Jul 2026", "monthly": [...], "topProducts": [...], "summary": {...} },
    "FY27": { "fyLabel": "Aug 2026 – Jul 2027", "monthly": [...], "topProducts": [...], "summary": {...} }
  }
}
```

**`fetch-data.js` works out the current fiscal year from today's date automatically** — no manual editing needed at year-end. Each nightly run only ever writes to the block matching the *current* year (`years[currentFY]`); every other year is carried over completely untouched, so a bad run can't corrupt historical data.

The dashboard shows a **year tab-switcher** in the header once more than one year exists, so you can flick between FY26, FY27, etc. and compare them.

`email-data.json` is unaffected by any of this — it's a rolling 90-day window (not fiscal-year scoped), so it just keeps updating on its own with no year boundary to manage.

---

## Setup — do this once

### Step 1 — Create a GitHub repository

1. Go to github.com and sign in
2. New repository → name it `ror-dashboard`
3. Set to **Private** (recommended — contains business data)
4. Do not initialise with README (you're uploading these files)
5. Upload all files from this folder maintaining the directory structure

---

### Step 2 — Add GitHub Secrets

These are encrypted — never visible in code or logs.

Go to: **Settings → Secrets and variables → Actions → New repository secret**

Add these four secrets:

| Secret name | Value | Where to find it |
|---|---|---|
| `SHOPIFY_STORE` | `rockonruby` | Just the subdomain, no .myshopify.com |
| `SHOPIFY_TOKEN` | `shpat_xxx...` | Same token used in stock control script |
| `GA4_PROPERTY_ID` | `123456789` | GA4 Admin → Property Settings → Property ID (9 digits) |
| `GA4_CREDENTIALS` | `{ "type": "service_account", ... }` | See Step 3 below |

---

### Step 3 — Set up GA4 service account (for sessions data)

This allows the script to read your GA4 analytics automatically.

1. Go to **console.cloud.google.com**
2. Create a new project (or select existing) — call it `ror-dashboard`
3. Search for and enable the **Google Analytics Data API**
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
   - Name: `ror-dashboard`
   - Click through the rest with defaults
5. Click the service account → **Keys → Add Key → Create new key → JSON**
   - This downloads a `.json` file to your computer
6. Go to **analytics.google.com → Admin → Property Access Management**
   - Click + → enter the service account email address (ends in `@...gserviceaccount.com`)
   - Role: **Viewer**
7. Open the downloaded JSON file in a text editor
8. Copy the **entire contents** and paste as the `GA4_CREDENTIALS` GitHub secret

> If you skip this step, sessions data will show as `—` in the dashboard. Everything else (revenue, orders, AOV, repeat rate) still works without GA4.

---

### Step 4 — Enable GitHub Pages

1. Go to your repository → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** · Folder: **/ (root)**
4. Save

GitHub will give you your URL: `https://[username].github.io/ror-dashboard`

It takes 2–3 minutes for the first deploy.

---

### Step 5 — Run the Action manually (first time)

1. Go to **Actions → Fetch Dashboard Data**
2. Click **Run workflow → Run workflow**
3. Watch it complete (takes ~2 minutes)
4. Refresh your dashboard URL — live data should appear

After this, the Action runs automatically every day at 6am BST.

---

### Step 6 — Optional: add Anthropic API key for AI analysis

To enable the "Get insight" button in the dashboard:

Open `index.html` in a text editor and paste your key on line 1 of the script:

```js
const HARDCODED_KEY = 'sk-ant-your-key-here';
```

Save, commit, push. The AI analysis button will work without asking for a key.

If you leave it blank, team members can enter their own key when they want to use it.

---

## How it works day to day

**Every morning at 6am:**
1. GitHub Actions wakes up
2. Calls Shopify Orders API — fetches the *current* fiscal year's orders, aggregates by month
3. Calls GA4 Data API — fetches sessions by month
4. Writes that year's block into `data.json`, leaving every other year untouched
5. GitHub Pages serves the updated file

**When anyone opens the dashboard URL:**
1. The page loads instantly (static HTML)
2. Fetches `data.json` (takes under a second)
3. Dashboard renders with today's numbers for the current year, with a year switcher if past years exist
4. Revenue goal slider works immediately

**At the end of each fiscal year (31 July):**
Nothing needs to be done manually. From 1 August, `fetch-data.js` automatically recognises it's a new fiscal year, starts a fresh block for it, and the year before becomes a frozen, browsable archive in the year switcher.

**If `data.json` hasn't been generated yet:**
The dashboard shows the real seed data from May 2026 (pulled directly from Shopify). Once the Action runs for the first time, it switches to live data automatically.

---

## Troubleshooting

**Action fails:** Go to Actions → click the failed run → expand the step to see the error. Most common causes: wrong Shopify token, GA4 service account not given access to the property, GA4 credentials JSON not pasted correctly (must be the entire file contents).

**Dashboard shows seed data:** Either the Action hasn't run yet (trigger it manually per Step 5) or it failed silently. Check the Actions tab.

**Sessions always show `—`:** GA4 credentials not set up. Revenue, orders, AOV and repeat rate all work without GA4.

**GitHub Pages not loading:** Check Settings → Pages — it can take 5 minutes on first deploy. Also make sure the branch is set to `main` and folder to `/`.

**A past year's numbers look wrong or missing:** They won't have been touched by any recent run — check that `data.json` still has a `years` object with that year's key in it (open the file on GitHub and search for it). If it's genuinely missing, restore it from an earlier commit in the file's history.

### If GA4 rejects the service account email

If GA4 will not let you add the service account email in **Admin → Property Access Management**, use the one-time Admin API helper:

1. In Google Cloud, enable the **Google Analytics Admin API**.
2. Create an OAuth client ID of type **Desktop app**.
3. Run:

```bash
cd scripts
npm install
GA4_PROPERTY_ID="123456789" \
GA4_SERVICE_ACCOUNT_EMAIL="your-service-account@your-project.iam.gserviceaccount.com" \
GOOGLE_OAUTH_CLIENT_ID="your-oauth-client-id" \
GOOGLE_OAUTH_CLIENT_SECRET="your-oauth-client-secret" \
node grant-ga4-access.js
```

Open the printed URL, sign in with a Google account that already has **Administrator** access to the GA4 property, and approve the request. The script grants the service account **Viewer** access to that property.

After that, add these GitHub secrets:

| Secret name | Value |
|---|---|
| `GA4_PROPERTY_ID` | The numeric GA4 property ID |
| `GA4_CREDENTIALS` | The full service account JSON key |

Then run **Actions → Test GA4 API Access → Run workflow** in GitHub.

---

## Adding the AI key later

If you want to add the Anthropic API key to the file after initial setup:
1. Edit `index.html` on GitHub (click the file → pencil icon → edit)
2. Find `const HARDCODED_KEY = '';` near the top of the script
3. Change to `const HARDCODED_KEY = 'sk-ant-your-key';`
4. Commit — GitHub Pages rebuilds in ~30 seconds

---

## Paid Ads tab (Shopify Growth)

A tab on the **Shopify Growth** dashboard (not ROR Sales — this is marketing/attribution data, out of scope for the sales-only dashboard) showing real daily Meta + Google Ads performance: spend, conversions, conversion value, ROAS, cost-per-conversion and clicks, per channel or blended, with daily/weekly/monthly granularity and previous-period/previous-year comparisons. Matches the columns the paid ads agency's own report actually surfaces — not the full campaign-level breakdown, which stays in Ads Manager / Google Ads where it belongs.

It also shows a **"Shopify actuals" panel** alongside the ad numbers — real Shopify orders/sessions/conversion rate (from `data.json`, monthly grain) next to what the ad platforms claim credit for. Meta/Google's own conversion counts are self-attributed (click/view-through windows, cross-device modelling) and can overstate their real contribution; comparing against total Shopify orders is a quick sanity check on how much to trust the platform number.

### Setup

1. **One-off backfill** (do this once, so you get real trend/YoY comparisons immediately instead of waiting a year): go to **Actions → Backfill Paid Ads History → Run workflow**. Defaults to 400 days; change the `days` input if you want more/less.
2. From then on, **Actions → Fetch Paid Ads Data** runs nightly (6:35am BST) automatically, re-fetching the last 3 days each time (ad platforms keep finalising attribution for a day or two) and never touching older history.
3. Uses the same `META_ACCESS_TOKEN`/`META_AD_ACCOUNT_ID`/`GOOGLE_ADS_*` secrets already set up for the Margin tab's LTV:CAC — nothing new to configure.

### Architecture

`ads/calculations.js` is the same kind of pure, unit-tested calculation layer as the rest of this dashboard (date-range resolution, aggregation that always sums raw spend/conversions/clicks before deriving ROAS/CPA — never averages per-day ratios — honest "not-occurred"/"no-data"/"partial" states, never a fabricated number). It's loaded as its own module (not folded into the single Shopify Growth script) purely so it stays testable the same way `dashboard2/calculations.js` is. The tab's chart reuses `dashboard2/charts.js`'s `SalesChart` component — it was already a generic, dashboard-agnostic SVG chart, so this tab passes it its own series with explicit labels/colours rather than duplicating a chart component.

---

## Dashboard 2 — ROR Sales

Consolidated commercial sales reporting across **Shopify, NOTHS and Etsy** — revenue,
orders, AOV, channel contribution, MoM/YoY growth and historical trends. It sits
behind the **ROR Sales** tab next to **Shopify Growth** at the top of `index.html`,
built as a second, independent app inside the same page rather than a rewrite of
the first one. It reports *sales*, not marketing attribution — it never touches
`email-data.json` or `ltv-cac.json`, and Dashboard 1's own metrics are untouched.

### How to open it

There's no build step. Serve the repo root with any static file server and open
`index.html`:

```bash
python3 -m http.server 8000   # from the repo root
# open http://localhost:8000/index.html, click "ROR Sales" top-right
```

(GitHub Pages serves it exactly the same way — nothing extra to configure.)

### Architecture — why it's five small files, not one big one

Dashboard 1 is deliberately one script, but Dashboard 2 is exploratory (filters,
charts, comparisons) and needed a separation the brief asked for explicitly: a
"data adapter" boundary that the calculations and UI can't see past, so swapping
demo data for a real StockHub v2 feed later is a one-file change.

| File | Role |
|---|---|
| `dashboard2/data-model.js` | Shared vocabulary: the 5 channels (3 active + 2 closed), each channel's *revenue definition* (see below), financial-year math (Aug→Jul, matching `fetch-data.js`), and which report granularities are currently supported. |
| `dashboard2/data-adapter.js` | The **only** place that knows where records come from. `createDemoAdapter()` today; a `createStockHubAdapter()` later returns the exact same `{ meta, records }` shape. |
| `dashboard2/calculations.js` | Every calculation — date-range resolution, aggregation, weighted AOV, MoM/YoY comparisons, channel contribution, chart series. Pure functions, no DOM — see `dashboard2/test/calculations.test.js`. |
| `dashboard2/charts.js` | One SVG chart component (bar / line / stacked-bar / area / donut), no charting library. |
| `dashboard2/ror-sales-app.js` | The UI: KPI cards, the sales comparison table, the interactive explorer, channel contribution. |

These load as plain `<script>` tags after Dashboard 1's own script (so they can
reuse its `el`/`fmtC`/`useState` helpers and visual language) and before a small
final script that adds the nav switcher and decides which dashboard to render.
Nothing in Dashboard 1's code was changed to make this work.

### The canonical sales record

Every number on Dashboard 2 traces back to records shaped like this — see
`dashboard2/data-model.js` for the full contract:

```json
{ "period": "2026-08", "channel": "shopify", "revenue": 21982.85, "orders": 591,
  "currency": "GBP", "source": "demo-fixture", "completeness": "complete" }
```

`period` is always a month (`YYYY-MM`) — that's the grain both the real workbook
and the demo fixture actually hold. Quarterly / financial-year / calendar-year
views are aggregated up from these; daily/weekly are honestly disabled in the UI
(with an explanation) rather than invented from monthly totals.

### Revenue is not measured the same way on every channel

Straight from the source workbook — the NOTHS sheet is literally titled "Payments
every week (2-3 weeks in arrears)". Summing these three as if they were the same
measurement would be misleading, so each channel's definition is shown at the
bottom of the ROR Sales page:

- **Shopify** — gross order revenue, order date.
- **NOTHS** — *payout* revenue, settled 2–3 weeks in arrears (payment date, not order date).
- **Etsy** — order receipts, order date, before Etsy fees.

### Demo data (what's actually deployed)

`dashboard2/demo-data.json` is **entirely fictional** — procedurally generated by
`scripts/build-demo-data.js` (deterministic seeded RNG, not a transcription of
the real workbook). It's clearly labelled in its own `meta.label` field and in a
banner at the top of the dashboard. Regenerate it with:

```bash
node scripts/build-demo-data.js
```

### Testing against the real workbook (local only, never committed)

`scripts/import-sales-spreadsheet.js` converts the real `Sales Revenue
Cashflow.xlsx` into the same record shape, so you can eyeball the dashboard
against real numbers on your own machine:

```bash
cd scripts && npm install               # installs the `xlsx` reader
# put the real workbook at local-data/Sales Revenue Cashflow.xlsx
node import-sales-spreadsheet.js
# -> local-data/dashboard2-real-data.json
```

`local-data/` is gitignored (see `.gitignore`) — **this repository is public**, so
neither the workbook nor anything derived from it should ever be committed,
and the deployed site must keep reading `dashboard2/demo-data.json`, not this
file. The import script logs how many months it parsed per channel so you can
sanity-check row/column counts against the workbook before trusting it, and it
never fabricates a month it can't find — a blank cell stays a blank record, not
a zero.

Note: `xlsx` (SheetJS) carries a known npm-registry advisory on prototype
pollution / ReDoS in the parser (SheetJS stopped publishing patched builds to
npm after v0.18.5). This script only ever reads a single trusted local file you
already have and never runs in CI or against untrusted input, which is a very
different risk profile to using the package as a server dependency — but if
that still bothers you, grab a patched build from SheetJS's own CDN instead of
npm before running `npm install` here.

### Running the tests

```bash
node dashboard2/test/calculations.test.js
```

Covers: weighted AOV (never averaging per-store/per-month AOVs), MoM/YoY math,
financial-year boundaries, a month-in-progress never being silently compared as
complete, missing data never becoming zero, a future period never being
fabricated, division-by-zero never producing `Infinity`/`NaN`, and legacy
(closed) channels staying out of the default "All Stores" view.

### Phase 2 — connecting real StockHub v2 data

StockHub v2 already has Shopify/Etsy/NOTHS order integrations and a sales-history
table (`migrations/0022_sales_history.sql`, `src/lib/salesHistory.ts`). To swap
it in for the demo fixture:

1. **Don't call StockHub's API directly from the browser.** Its credentials must
   never reach a publicly served page. Add a small, read-only, authenticated
   reporting endpoint (or a scheduled export, mirroring how `fetch-data.js`
   already pulls Shopify data server-side and writes a static JSON file) that
   returns records in the exact shape above.
2. Add `createStockHubAdapter()` next to `createDemoAdapter()` in
   `dashboard2/data-adapter.js`, returning the same `{ meta, records }` shape.
   Nothing in `calculations.js` or `ror-sales-app.js` needs to change.
3. **Reconcile before trusting it.** StockHub's `sales_history` schema is built
   for inventory analytics first — check its revenue fields actually match each
   channel's original store report (gross vs net, before/after refunds, order
   date vs settlement date) before treating them as verified business revenue.
   Confirm it can answer, per channel and per month:
   - revenue (and which revenue — see "Revenue is not measured the same way" above)
   - order count
   - date range covered, and whether historical (pre-integration) months exist
   - refunds/discounts, if they're meant to net against revenue anywhere
   
   Anything StockHub can't currently answer needs to stay in `completeness:
   "unavailable"` rather than being guessed at.
4. Keep `demo-fixture` as the fallback adapter (same pattern `data.json`'s own
   `FALLBACK` constant uses) so the page still renders something sensible if the
   StockHub endpoint is briefly down.
