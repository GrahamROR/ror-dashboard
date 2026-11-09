# Historical years in the normal dashboard controls

The public dashboard had the backfill but exposed it only through a collapsed archive. Shopify’s header stopped at FY24, and ROR Sales’ normal date controls continued to use live-only reporting. This did not meet Graham’s expectation that choosing an older period should show the data.

Shopify now has a labelled financial-year selector with FY16 onward, derived from actual source depth. Years that contain workbook months open a monthly source view. FY24 displays five recorded workbook months and seven native Net Sales months. Current native years return to the original Growth screen. Legacy selections stay separate from the native selected year; no legacy values enter Growth goals, forecasts or YoY calculations.

ROR Sales adds explicit completed fiscal years to all three date selectors. Page, comparison and explorer selections route independently to the same monthly historical view whenever a selected store needs archive data. Store filters apply to the columns. Current periods use the existing components and calculations. Exact selected dates are preserved: real API/native days can be clipped, while partial workbook months remain unavailable rather than being prorated.

The live financial stores, financial exports, management calculations, daily refresh and goal logic are unchanged. Historical source labels, nulls and incompatible-basis rules are preserved. Workbook revenue still has no confirmed Net/Gross basis and never creates a combined Net Sales figure. Financial test expectations were not changed.

Validation: the full required suite passes 180 tests: 176 passed, four intentional skips, zero failures. New source-range tests prove exact clipped marketplace/native sums against the unchanged management calculation, workbook precision, fiscal-year identity, channel-specific routing and bounded source periods. Existing eleven-preset controls and original Growth interface checks pass.

Real browser checks follow the owner’s actual paths: FY16 through the Shopify selector and all three ROR date selectors; mixed-source FY24; exact return to the original native Growth body; seven Growth tabs; store filters; partial workbook ranges; unchanged current-FY Net Sales of £79,554.92; desktop/mobile layouts and DD-MM-YYYY dates. Corrupt history is isolated and retry restores the year options. Each of the three optional historical scripts can be missing without taking down current reporting. Screenshots, the reproducible browser check and machine-readable results are included alongside this report.

Claude reviewed the architecture and small tested range-helper stage before UI expansion. Its completed UI review found no remaining blockers; it verified every hook insertion, source boundary, routing branch and financial guard.
