import test from 'node:test';
import assert from 'node:assert/strict';
import { isWholeMonth, monthRange, rangesOverlappingDays, retryDelaySeconds, toCsv } from '../src/lib.js';

test('month ranges are inclusive/exclusive UTC calendar months', () => {
  assert.deepEqual(monthRange('2023-02-12T10:00:00Z'), { from: '2023-02-01', to: '2023-03-01', yearMonth: '2023-02' });
  assert.equal(isWholeMonth('2023-02-01', '2023-03-01'), true);
  assert.equal(isWholeMonth('2023-02-01', '2023-02-15'), false);
});

test('rolling windows enqueue every overlapping month', () => {
  assert.deepEqual(rangesOverlappingDays(new Date('2026-03-03T05:00:00Z'), 7).map((r) => r.yearMonth), ['2026-02', '2026-03']);
  assert.deepEqual(rangesOverlappingDays(new Date('2026-03-20T05:00:00Z'), 7).map((r) => r.yearMonth), ['2026-03']);
});

test('CSV output quotes commas, quotes and newlines', () => {
  const csv = toCsv(['a', 'b'], [{ a: 'x,y', b: 'say "hi"\nnow' }]);
  assert.equal(csv, 'a,b\n"x,y","say ""hi""\nnow"\n');
});

test('retry backoff starts at fifteen minutes and caps at six hours', () => {
  assert.equal(retryDelaySeconds(0), 900);
  assert.equal(retryDelaySeconds(2), 3600);
  assert.equal(retryDelaySeconds(20), 21600);
});
