# Rock On Ruby — Growth Dashboard

Live dashboard served by GitHub Pages. Data pulled nightly from Shopify + GA4 via GitHub Actions.

**URL once live:** `https://[your-github-username].github.io/ror-dashboard`

---

## File structure

```
ror-dashboard/
├── index.html                        ← the dashboard (served by GitHub Pages)
├── data.json                         ← generated nightly by GitHub Actions (multi-year — see below)
├── email-data.json                   ← generated nightly by GitHub Actions (rolling 90-day window)
├── scripts/
│   ├── fetch-data.js                 ← fetches Shopify + GA4, writes data.json
│   ├── fetch-email-data.js           ← fetches Klaviyo + Shopify, writes email-data.json
│   └── package.json                  ← googleapis dependency
└── .github/
    └── workflows/
        ├── fetch-data.yml            ← runs daily at 6am BST
        └── fetch-email-data.yml      ← runs daily at 6am BST, 10 mins after the above
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
