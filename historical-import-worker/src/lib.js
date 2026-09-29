export const SOURCES = ['shopify', 'etsy', 'noths'];

export function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function monthRange(value) {
  const date = new Date(value);
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { from: isoDate(from), to: isoDate(to), yearMonth: isoDate(from).slice(0, 7) };
}

export function rangesOverlappingDays(now, days) {
  const end = new Date(now);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const ranges = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    ranges.push(monthRange(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return ranges;
}

export function isWholeMonth(dateFrom, dateTo) {
  const range = monthRange(`${dateFrom}T00:00:00.000Z`);
  return range.from === dateFrom && range.to === dateTo;
}

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(columns, rows) {
  return [columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\n') + '\n';
}

export function retryDelaySeconds(retryCount) {
  return Math.min(6 * 60 * 60, 15 * 60 * (2 ** Math.max(0, retryCount)));
}

export function safeError(error) {
  return String(error instanceof Error ? error.message : error).slice(0, 2000);
}
