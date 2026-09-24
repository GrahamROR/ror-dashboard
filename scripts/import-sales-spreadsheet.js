// ============================================================
// ROR SALES DASHBOARD 2 — real spreadsheet import (LOCAL ONLY)
// ------------------------------------------------------------
// Converts the real "Sales Revenue Cashflow.xlsx" workbook into
// the canonical sales-record model used by Dashboard 2, so Graham
// can validate the dashboard against real historical numbers on
// his own machine.
//
// THIS SCRIPT NEVER RUNS IN CI AND ITS OUTPUT IS NEVER COMMITTED.
// ror-dashboard is a PUBLIC repository — real revenue figures must
// stay out of it. Input and output both live under local-data/,
// which is gitignored (see .gitignore). If you're reading this in
// a review and see real numbers anywhere in the repo, that's a bug —
// flag it.
//
// Usage:
//   cd scripts && npm install        # installs the `xlsx` reader
//   node import-sales-spreadsheet.js [path/to/workbook.xlsx]
//     (defaults to ../local-data/Sales Revenue Cashflow.xlsx)
//
// Output: local-data/dashboard2-real-data.json — same shape as
// dashboard2/demo-data.json, so it can be dropped in as a like-for-
// like swap when eyeballing the dashboard against real figures
// (again, only ever locally — never point the deployed site at it).
//
// How it parses each channel sheet (Shopify / NOTHS / Etsy /
// Silk Fred / ASOS): every sheet in the workbook lays months out
// as column-pairs (Sales, Revenue) across a header row, then stacks
// one row per year underneath, with occasional YOY/MOM helper rows
// in between that this script skips. Rather than hardcoding row/
// column numbers (which is exactly the "manual transcription" the
// build brief says not to do, and which would silently break the
// moment Graham adds a row), this script:
//   1. finds the header row by scanning for month names,
//   2. maps each month to its Sales/Revenue column pair from the
//      two rows directly under that header,
//   3. scans column A below that for 4-digit years, reading one
//      year's 12 months from each such row.
// It logs what it found (and skipped) so you can sanity-check the
// row/column counts against the workbook before trusting the output.
// ============================================================

const fs = require('fs');
const path = require('path');

let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  console.error('Missing dependency `xlsx`. Run: cd scripts && npm install');
  process.exit(1);
}

const DEFAULT_INPUT = path.join(__dirname, '..', 'local-data', 'Sales Revenue Cashflow.xlsx');
const OUTPUT_PATH = path.join(__dirname, '..', 'local-data', 'dashboard2-real-data.json');

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const SHEET_CHANNEL_MAP = {
  'Shopify': 'shopify',
  'Not On The High Street': 'noths',
  'Etsy': 'etsy',
  'Silk Fred': 'silkfred',
  'ASOS': 'asos',
};

function monthIndexFromLabel(label) {
  if (typeof label !== 'string') return -1;
  const norm = label.trim().slice(0, 3).toLowerCase();
  return MONTH_NAMES.indexOf(norm);
}

// Find the row (1-indexed) containing at least 6 recognisable month
// names, and return { headerRow, monthCols: { 0: colIdx, 1: colIdx, ... } }
// mapping calendar-month-index -> the column where that month's block starts.
function findMonthHeaderRow(sheet, maxRow, maxCol) {
  for (let r = 1; r <= Math.min(maxRow, 10); r++) {
    const monthCols = {};
    for (let c = 1; c <= maxCol; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
      const mi = monthIndexFromLabel(cell && cell.v);
      if (mi >= 0 && !(mi in monthCols)) monthCols[mi] = c;
    }
    if (Object.keys(monthCols).length >= 6) return { headerRow: r, monthCols };
  }
  return null;
}

function cellValue(sheet, r, c) {
  const cell = sheet[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
  return cell ? cell.v : undefined;
}

function parseChannelSheet(sheet, channel, warnings) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const maxRow = range.e.r + 1, maxCol = range.e.c + 1;
  const found = findMonthHeaderRow(sheet, maxRow, maxCol);
  if (!found) {
    warnings.push(`[${channel}] could not find a month-name header row — skipped`);
    return [];
  }
  const { headerRow, monthCols } = found;
  const records = [];

  for (let r = headerRow + 1; r <= maxRow; r++) {
    const yearVal = cellValue(sheet, r, 1);
    if (typeof yearVal !== 'number' || yearVal < 2000 || yearVal > 2100) continue; // skip YOY/MOM/blank rows
    const year = Math.round(yearVal);

    for (let mi = 0; mi < 12; mi++) {
      const col = monthCols[mi];
      if (!col) continue;
      // Convention observed across sheets: [Sales/count col, Revenue/£ col]
      const orders = cellValue(sheet, r, col);
      const revenue = cellValue(sheet, r, col + 1);
      if (revenue == null && orders == null) continue; // genuinely no data for this month — not zero
      const calMonth = mi + 1;
      const period = `${year}-${String(calMonth).padStart(2, '0')}`;
      records.push({
        period, channel,
        revenue: typeof revenue === 'number' ? Math.round(revenue * 100) / 100 : null,
        orders: typeof orders === 'number' ? Math.round(orders) : null,
        currency: 'GBP',
        source: 'spreadsheet-import',
        completeness: 'complete', // a spreadsheet-recorded month is treated as closed/complete
      });
    }
  }
  return records;
}

function main() {
  const inputPath = process.argv[2] || DEFAULT_INPUT;
  if (!fs.existsSync(inputPath)) {
    console.error(`Workbook not found: ${inputPath}`);
    console.error('Place the real workbook at local-data/Sales Revenue Cashflow.xlsx (gitignored) or pass a path.');
    process.exit(1);
  }

  const wb = XLSX.readFile(inputPath, { cellDates: false });
  const warnings = [];
  const allRecords = [];

  for (const [sheetName, channel] of Object.entries(SHEET_CHANNEL_MAP)) {
    if (!wb.Sheets[sheetName]) {
      warnings.push(`Sheet "${sheetName}" not found in workbook — skipped (${channel} will have no records)`);
      continue;
    }
    const records = parseChannelSheet(wb.Sheets[sheetName], channel, warnings);
    console.log(`${sheetName} -> ${channel}: parsed ${records.length} month-records` +
      (records.length ? ` (${records[0].period} .. ${records[records.length - 1].period})` : ''));
    allRecords.push(...records);
  }

  allRecords.sort((a, b) => (a.period === b.period ? a.channel.localeCompare(b.channel) : a.period.localeCompare(b.period)));

  const out = {
    meta: {
      label: 'REAL DATA — imported from the private workbook. LOCAL ONLY. Never commit, publish, or point the live GitHub Pages site at this file.',
      generator: 'scripts/import-sales-spreadsheet.js',
      generatedAt: new Date().toISOString(),
      sourceFile: path.basename(inputPath),
      grain: 'monthly',
      currency: 'GBP',
      warnings,
    },
    records: allRecords,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2) + '\n');

  console.log(`\nWrote ${allRecords.length} records to ${OUTPUT_PATH}`);
  if (warnings.length) {
    console.log('\nWarnings:');
    warnings.forEach((w) => console.log('  - ' + w));
  }
  console.log('\nNext: compare a few known months against the workbook\'s own TOTALS sheet by eye before trusting this for anything beyond dashboard testing.');
  console.log('Reminder: local-data/ is gitignored. Do not add these files with `git add -f`.');
}

main();
