# Historical dashboard design and comparisons

Graham’s screenshots showed a plain monthly history table beside the newer dashboard’s richer cards and charts. Historical periods selected through the normal Shopify and ROR controls now use the same dark cards, colour palette and typography, with prominent source-aware totals, monthly bar/line charts, and a compact breakdown with changes. Source details are collapsed once per view rather than repeated as paragraphs in every cell. The original raw archive remains available for source inspection.

The view supports Revenue / Orders and Same months last year / Previous period / No comparison. Charts and table compare individual calendar months; summary cards compare the whole selected period against the prior matching number of calendar months or prior year. Requested dates stay explicit and DD-MM-YYYY. Partial selected amounts remain visible in the table, with monthly growth withheld.

## Financial rules

- Recorded Shopify workbook revenue compares only with the same recorded field, labelled Recorded revenue; it is never asserted to be Net or Gross Sales. Recorded order counts compare only with recorded counts. Both are blocked at the native Shopify boundary when definitions change.
- Native Shopify, Etsy and NOTHS use their existing Net Sales arithmetic and source count policies. Historical/live marketplace comparisons retain both periods’ confidence. Nothing becomes independently reconciled accounting data because it is charted.
- Full-period totals and growth require exact coverage and one compatible basis. Missing months remain unknown. Labelled subtotals are separate from complete totals. FY24’s £45,556.06 workbook subtotal and £73,774.50 native Net Sales subtotal never become a blended annual total.
- Known full-month workbook order counts can remain usable when the revenue field is null. Count completeness is independent; the missing revenue stays unavailable. Missing source days, partial calendar selections, unsafe counts and incompatible count policies still block growth.
- A zero baseline has an absolute change but no percentage. Source gaps and basis changes leave chart gaps, never zero-filled or bridged comparison lines. Negative amounts are retained; this view deliberately falls back to the table for the whole chart if a negative series exists. The actual historical corpus contains no negative monthly amounts.
- A subset of stores never receives a three-store All Stores total. Empty combined-Net columns are omitted where the source basis does not support them.

## Validation and review

The small comparison kernel was tested and reviewed by Claude before expansion. It adapts source parts into the existing `compareAggregates()` arithmetic with integer pence; it never passes historical rows into live aggregation or changes their validation status. Further reviews checked period coverage, mixed bases, independent recorded counts, confidence retention, source labels and opt-in chart changes. Claude found no remaining source-review blockers.

The full required local suite passes 198 tests: 194 passed, four existing intentional private-evidence skips, zero failures. Eighteen targeted comparison/chart tests cover the financial and visual guards; the chart tests are now explicitly included in hosted CI. Original financial expectations were not changed.

Real Chrome acceptance verifies recorded FY17 totals (£12,038.85 / 439 orders), January 2017 YoY (+£125.00), January MoM (−£2,642.40), full FY18 recorded revenue change (+£13,007.85), both metrics, all comparison modes and bar/line choices, split FY24, independent ROR sections, partial-date guards, and optional comparison-module failure. The newer Growth body restores exactly; all seven tabs still work. Desktop/mobile document width and actual tooltip bounds pass with no page errors.

Browser checks fix the London clock at 09-11-2026 20:00 to test the retained source snapshots through 08-11-2026 deterministically. The £79,554.92 current-FY regression value is for those snapshots and that clock, not a claim of a later data refresh. Public deployment verification uses the same acceptance plus exact live-file hashes.

Local preview startup intermittently lost required script requests with the default test server. The disposable preview used a larger request queue; no application or goal code was changed to mask it. A real mobile tooltip overflow was fixed behind an opt-in property and tested by both document width and bounding box. The existing native chart path stays unchanged when the new flags are absent.

## Reproduction and protected scope

Run `python3 docs/historical-comparisons-20261110/serve-preview.py` from the repository root, then `python3 docs/historical-comparisons-20261110/browser-check.py local <output-directory>`. Python Playwright and installed Google Chrome are required. Use `live` instead of `local` to check the published site. Before screenshots use the prior renderer at `cbd07b8` with the same public aggregates and selected periods.

Live financial stores, exports, management arithmetic, daily-refresh logic, source data, Growth goals and forecasts are unchanged. The only workflow change adds the two targeted SVG tests to reporting CI; no production schedule, credential, permission or hosting setting changes. Evidence contains public monthly aggregates and webpage captures, never the raw workbook, customer records or private source captures.
