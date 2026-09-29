import test from 'node:test';
import assert from 'node:assert/strict';
import { callImporter } from '../src/jobs.js';

test('month imports use the private StockHub service binding without credential headers', async () => {
  let captured;
  const env = {
    STOCKHUB: {
      async fetch(request) {
        captured = request;
        return Response.json({ ok: true, run_id: 42, rows_fetched: 10 });
      },
    },
  };

  const result = await callImporter(env, {
    source: 'etsy',
    date_from: '2023-02-01',
    date_to: '2023-03-01',
  });

  assert.equal(result.run_id, 42);
  assert.equal(new URL(captured.url).pathname, '/api/sales-history/pull-month');
  assert.equal(captured.headers.get('CF-Access-Client-Id'), null);
  assert.equal(captured.headers.get('CF-Access-Client-Secret'), null);
  assert.deepEqual(await captured.json(), { source: 'etsy', year: 2023, month: 2 });
});

test('partial-month jobs are rejected before StockHub is called', async () => {
  let called = false;
  const env = {
    STOCKHUB: {
      async fetch() {
        called = true;
        return Response.json({ ok: true });
      },
    },
  };

  await assert.rejects(
    callImporter(env, { source: 'shopify', date_from: '2023-01-01', date_to: '2023-01-15' }),
    /full calendar months/
  );
  assert.equal(called, false);
});
