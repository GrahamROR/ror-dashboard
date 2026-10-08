const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const F = require("../contract"),
  B = require("../build-staging"),
  { request, collect } = require("../collect"),
  { rollback } = require("../rollback");
const manifest = require("../staging/manifest.json"),
  live = require("../staging/" + manifest.file),
  C = require("../../dashboard2/calculations");
const seed = (rows) => ({
  id: "fixture",
  store: {
    domain: "test.myshopify.com",
    currency: "GBP",
    timezone: "Europe/London",
  },
  days: rows,
  periods: [],
  products: [],
});
const row = (day, patch = {}) => ({
  day,
  gross_sales: 10000,
  discounts: -1000,
  sales_reversals: 0,
  net_sales: 9000,
  shipping_charges: 500,
  taxes: 1900,
  total_sales: 11400,
  orders: 2,
  ...patch,
});
test("Money precision is exact, signed and nullable; excessive precision is rejected", () => {
  assert.equal(F.minor("247999.66"), 24799966);
  assert.equal(F.minor("-0.01"), -1);
  assert.equal(F.minor(null), null);
  assert.equal(F.minor(""), null);
  assert.throws(() => F.minor("1.001"));
  assert.throws(() => F.minor("NaN"));
});
test("Native discounts, partial/full returns and cancellations retain signed adjustments without altering order counts", () => {
  const s = seed([
    row("2026-07-31"),
    row("2026-08-01", {
      gross_sales: 0,
      discounts: 1000,
      sales_reversals: -10000,
      net_sales: -9000,
      shipping_charges: -500,
      taxes: -1900,
      total_sales: -11400,
      orders: 0,
    }),
    row("2026-08-02", {
      gross_sales: 0,
      discounts: 0,
      sales_reversals: -1500,
      net_sales: -1500,
      shipping_charges: 0,
      taxes: -300,
      total_sales: -1800,
      orders: 0,
    }),
  ]);
  const closed = F.select(s, "2026-07-31", "2026-07-31");
  assert.equal(closed.orders, 2);
  assert.equal(closed.net_sales, 9000);
  const later = F.select(s, "2026-08-01", "2026-08-02");
  assert.equal(later.net_sales, -10500);
  assert.equal(later.orders, 0);
  assert.equal(later.net_aov, null);
  assert.equal(later.component_residual, 0);
});
test("Shipping-only refunds and mixed/zero tax preserve actual tax; no VAT factor", () => {
  const s = seed([
    row("2026-01-01", {
      gross_sales: 0,
      discounts: 0,
      net_sales: 0,
      shipping_charges: -500,
      taxes: -100,
      total_sales: -600,
      orders: 0,
    }),
    row("2026-01-02", { taxes: 0, total_sales: 9500 }),
  ]);
  const r = F.select(s, "2026-01-01", "2026-01-02");
  assert.equal(r.taxes, -100);
  assert.equal(r.net_sales, 9000);
  assert.equal(r.total_sales, 8900);
  assert.equal(r.component_residual, 0);
});
test("Missing whole day, full month, tax and reversals stay unavailable, never zero", () => {
  const s = seed([row("2026-01-01")]);
  assert.equal(F.select(s, "2026-01-01", "2026-01-03").missingDays, 2);
  assert.equal(F.select(s, "2026-02-01", "2026-02-28").total_sales, null);
  assert.equal(F.select(s, "2026-01-01", "2026-01-03").net_aov, null);
  s.days[0].taxes = null;
  s.days[0].sales_reversals = null;
  const r = F.select(s, "2026-01-01", "2026-01-01");
  assert.equal(r.status, "missing");
  assert.equal(r.taxes, null);
  assert.equal(r.sales_reversals, null);
});
test("Native AOV requires exact native interval; zero-price eligible orders have zero net AOV", () => {
  const s = seed([
    row("2026-01-01", {
      gross_sales: 0,
      discounts: 0,
      net_sales: 0,
      taxes: 0,
      shipping_charges: 0,
      total_sales: 0,
      orders: 1,
    }),
  ]);
  s.periods = [
    { start: "2026-01-01", end: "2026-01-01", average_order_value: 1.234 },
  ];
  assert.equal(
    F.select(s, "2026-01-01", "2026-01-01").average_order_value,
    1.234,
  );
  assert.equal(F.select(s, "2026-01-01", "2026-01-01").net_aov, 0);
  assert.equal(
    F.select(s, "2026-01-01", "2026-01-02").average_order_value,
    null,
  );
});
test("Products preserve unassigned money and do not sum product orders", () => {
  const s = seed([row("2026-01-01")]);
  s.products = [
    { day: "2026-01-01", product_title: "A", net_sales: 6000, orders: 2 },
    { day: "2026-01-01", product_title: "", net_sales: 3000, orders: 2 },
  ];
  const p = F.products(s, "2026-01-01", "2026-01-01", "net_sales");
  assert.equal(p.residual, 0);
  assert.equal(p.rows[1].title, "Unassigned / non-product adjustments");
  assert.equal(F.select(s, "2026-01-01", "2026-01-01").orders, 2);
  assert.throws(() => F.products(s, "2026-01-01", "2026-01-01", "orders"));
});
test("Unknown total components remain explicit residuals", () => {
  const s = seed([row("2026-01-01", { total_sales: 11500 })]);
  assert.equal(F.select(s, "2026-01-01", "2026-01-01").component_residual, 100);
  assert.match(
    F.select(s, "2026-01-01", "2026-01-01").warnings.join(),
    /residual/,
  );
});
test("London calendar dates survive spring/autumn DST, leap day and FY boundaries", () => {
  for (const [now, end] of [
    ["2026-03-29T23:30:00Z", "2026-03-29"],
    ["2026-10-25T00:30:00Z", "2026-10-24"],
    ["2024-03-01T00:30:00Z", "2024-02-29"],
    ["2026-08-01T00:30:00Z", "2026-07-31"],
  ])
    assert.equal(
      C.resolveDateRange("yesterday", { nowDate: new Date(now) }).endDate,
      end,
    );
  assert.equal(F.next("2024-02-28"), "2024-02-29");
  assert.throws(() => F.select(live, "2026-01-02", "2026-01-01"));
  assert.throws(() =>
    F.select(live, "2026-01-01", "2026-01-02", "wrong.myshopify.com"),
  );
});
test("Every shared preset returns identical financial projections, including custom and absent 2023", () => {
  for (const p of C.REPORT_DATE_PRESETS) {
    const r = C.resolveDateRange(p.key, {
      nowDate: new Date("2026-10-08T12:00:00Z"),
      customStart: "2026-01-15",
      customEnd: "2026-02-10",
    });
    assert.deepEqual(
      F.growthReport(live, r.startDate, r.endDate),
      F.rorReport(live, r.startDate, r.endDate),
    );
  }
  assert.equal(F.select(live, "2023-01-01", "2023-12-31").total_sales, null);
});
test("All daily, monthly, annual and custom source controls match both dashboards exactly", () => {
  for (const p of live.periods) {
    const a = F.growthReport(live, p.start, p.end),
      b = F.rorReport(live, p.start, p.end);
    for (const k of F.ADDITIVE) {
      assert.equal(a[k], p[k], `${p.start} ${k}`);
      assert.equal(b[k], p[k]);
    }
    assert.equal(a.average_order_value, p.average_order_value);
    assert.equal(a.net_aov, p.orders ? p.net_sales / 100 / p.orders : null);
  }
});
test("Every month and FY product components reconcile at penny precision", () => {
  for (const p of live.periods.filter((p) => p.start !== p.end))
    for (const k of F.MONEY)
      assert.equal(F.products(live, p.start, p.end, k).residual, 0);
});
test("Monthly explorer clips custom first and last months", () => {
  const rows = F.months(live, "2026-01-15", "2026-02-10");
  assert.equal(rows[0].start, "2026-01-15");
  assert.equal(rows[0].end, "2026-01-31");
  assert.equal(rows[1].end, "2026-02-10");
  assert.equal(
    rows.reduce((n, r) => n + r.net_sales, 0),
    F.select(live, "2026-01-15", "2026-02-10").net_sales,
  );
});
test("Snapshot payload and file hashes match manifest; no order/customer identifiers", () => {
  const bytes = fs.readFileSync(path.join(B.ROOT, manifest.file));
  assert.equal(B.hash(bytes), manifest.sha256);
  const { id, ...body } = live;
  assert.equal(B.hash(JSON.stringify(body)), id);
  assert.doesNotMatch(
    bytes.toString(),
    /"(?:order_id|order_name|customer_id|email|address)"/,
  );
});
test("Source parser rejects truncated tables, duplicate count formats and nullable money stays missing", () => {
  assert.throws(() =>
    B.table({
      query: "LIMIT 1",
      columns: [{ name: "day" }],
      rows: [["2026-01-01"]],
      rowCount: 1,
    }),
  );
  assert.throws(() =>
    B.table({ query: "", columns: [], rows: [], rowCount: 1 }),
  );
  assert.throws(() => B.fact({ orders: "1.2" }));
  assert.equal(B.fact({ orders: "0" }).taxes, null);
});
test("Read-only transport retries rate limits and rejects parser/GraphQL failures without publishing", async () => {
  let calls = 0;
  const result = await request(
    "test.myshopify.com",
    "not-real",
    "query {}",
    {},
    async () =>
      ++calls === 1
        ? { status: 429 }
        : {
            status: 200,
            ok: true,
            json: async () => ({ data: { okay: true } }),
          },
    async () => {},
  );
  assert.equal(calls, 2);
  assert.equal(result.okay, true);
  await assert.rejects(
    request("test.myshopify.com", "not-real", "query {}", {}, async () => ({
      status: 200,
      ok: true,
      json: async () => ({ errors: [{ message: "failed" }] }),
    })),
  );
  await assert.rejects(
    request(
      "test.myshopify.com",
      "not-real",
      "query {}",
      {},
      async () => ({ status: 429 }),
      async () => {},
    ),
  );
});
test("Collector rejects FX/store changes and failed batches leave staging manifest intact", async () => {
  const before = fs.readFileSync(path.join(B.ROOT, "manifest.json"));
  await assert.rejects(
    collect(
      {
        domain: "test.myshopify.com",
        token: "not-real",
        start: "2026-01-01",
        end: "2026-01-31",
        run: "test-currency",
      },
      async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          data: {
            shop: {
              myshopifyDomain: "test.myshopify.com",
              currencyCode: "USD",
              ianaTimezone: "Europe/London",
            },
          },
        }),
      }),
    ),
    /currency/,
  );
  assert.deepEqual(fs.readFileSync(path.join(B.ROOT, "manifest.json")), before);
});
test("Production exports, attribution and marketplace inputs remain byte-identical", () => {
  const checks = fs
    .readFileSync(
      path.join(__dirname, "../../docs/pr2/production-data.sha256"),
      "utf8",
    )
    .trim()
    .split("\n");
  for (const line of checks) {
    const [expected, file] = line.split(/\s+/);
    assert.equal(
      B.hash(fs.readFileSync(path.join(__dirname, "../..", file))),
      expected,
      file,
    );
  }
});
test("Idempotent staging replay and rollback preserve immutable facts", () => {
  const pointer = fs.readFileSync(path.join(B.ROOT, "manifest.json"));
  const before = fs.readFileSync(path.join(B.ROOT, manifest.file));
  assert.equal(B.publish(live).snapshot_id, live.id);
  assert.equal(rollback(live.id).snapshot_id, live.id);
  assert.deepEqual(
    fs.readFileSync(path.join(B.ROOT, "manifest.json")),
    pointer,
  );
  assert.deepEqual(fs.readFileSync(path.join(B.ROOT, manifest.file)), before);
  assert.throws(() => rollback("../data"));
});
test(
  "Actual native source build is repeatable and source edits fail reconciliation",
  { skip: !fs.existsSync(path.join(B.ROOT, "source/daily.json")) },
  () => {
    assert.equal(B.build(path.join(B.ROOT, "source")).id, live.id);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ror-native-test-"));
    try {
      for (const name of fs
        .readdirSync(path.join(B.ROOT, "source"))
        .filter((n) => n.endsWith(".json")))
        fs.copyFileSync(
          path.join(B.ROOT, "source", name),
          path.join(dir, name),
        );
      const p = path.join(dir, "daily.json"),
        d = JSON.parse(fs.readFileSync(p));
      d.rows[0][d.columns.findIndex((c) => c.name === "net_sales")] = "999.00";
      fs.writeFileSync(p, JSON.stringify(d));
      assert.throws(() => B.build(dir), /reconciliation/);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  },
);

test("Rollback switches between two versioned snapshots and retains both histories", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ror-rollback-"));
  try {
    B.publish(live, dir);
    const { id, ...body } = live;
    body.policies = {
      ...body.policies,
      review: "synthetic rollback-test metadata only",
    };
    const revised = { ...body, id: B.hash(JSON.stringify(body)) };
    B.publish(revised, dir);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")))
        .previous_snapshot_id,
      live.id,
    );
    rollback(live.id, dir);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"))).snapshot_id,
      live.id,
    );
    assert.equal(fs.readdirSync(path.join(dir, "snapshots")).length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test("Collector assembles a complete custom-period capture; partial batches never become visible", async () => {
  const name = "test-capture-" + Date.now(),
    dest = path.join(B.ROOT, "source", name);
  let queries = 0;
  const transport = async (_url, options) => {
    const req = JSON.parse(options.body);
    if (!req.variables.query)
      return {
        status: 200,
        ok: true,
        json: async () => ({
          data: {
            shop: {
              id: "fixture",
              myshopifyDomain: "test.myshopify.com",
              currencyCode: "GBP",
              ianaTimezone: "Europe/London",
              taxesIncluded: true,
            },
          },
        }),
      };
    queries++;
    const q = req.variables.query;
    const data = {
      ...row("2026-01-15"),
      month: "2026-01-01",
      product_title: "",
      average_order_value: "45",
    };
    for (const k of F.MONEY) data[k] = String(data[k] / 100);
    const names = q.includes("GROUP BY")
      ? ["day", "product_title", ...F.MONEY]
      : q.includes("TIMESERIES day")
        ? ["day", ...F.ADDITIVE, "average_order_value"]
        : q.includes("TIMESERIES month")
          ? ["month", ...F.ADDITIVE, "average_order_value"]
          : [...F.ADDITIVE, "average_order_value"];
    return {
      status: 200,
      ok: true,
      json: async () => ({
        data: {
          shopifyqlQuery: {
            parseErrors: [],
            tableData: {
              columns: names.map((name) => ({ name, dataType: "fixture" })),
              rows: [
                Object.fromEntries(names.map((k) => [k, String(data[k])])),
              ],
            },
          },
        },
      }),
    };
  };
  try {
    await collect(
      {
        domain: "test.myshopify.com",
        token: "not-real",
        start: "2026-01-15",
        end: "2026-01-15",
        run: name,
      },
      transport,
    );
    assert.equal(queries, 4);
    const s = B.build(dest);
    assert.equal(s.coverage.start, "2026-01-15");
    assert.equal(s.periods[1].start, "2026-01-15");
    await assert.rejects(
      collect(
        {
          domain: "test.myshopify.com",
          token: "not-real",
          start: "2026-01-15",
          end: "2026-01-15",
          run: name,
        },
        transport,
      ),
      /already exists/,
    );
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});
test("Parse failure midway through capture retains previous snapshot and leaves no capture directory", async () => {
  const name = "test-failure-" + Date.now(),
    dest = path.join(B.ROOT, "source", name),
    before = fs.readFileSync(path.join(B.ROOT, "manifest.json"));
  const transport = async (_url, opts) => ({
    status: 200,
    ok: true,
    json: async () =>
      JSON.parse(opts.body).variables.query
        ? {
            data: {
              shopifyqlQuery: {
                parseErrors: ["invalid measure"],
                tableData: null,
              },
            },
          }
        : {
            data: {
              shop: {
                myshopifyDomain: "test.myshopify.com",
                currencyCode: "GBP",
                ianaTimezone: "Europe/London",
              },
            },
          },
  });
  await assert.rejects(
    collect(
      {
        domain: "test.myshopify.com",
        token: "not-real",
        start: "2026-01-01",
        end: "2026-01-31",
        run: name,
      },
      transport,
    ),
    /Invalid native/,
  );
  assert.equal(fs.existsSync(dest), false);
  assert.deepEqual(fs.readFileSync(path.join(B.ROOT, "manifest.json")), before);
});
test(
  "Duplicate daily facts and changed source currency are rejected by the builder",
  { skip: !fs.existsSync(path.join(B.ROOT, "source/daily.json")) },
  () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ror-contract-test-"));
    try {
      for (const name of fs
        .readdirSync(path.join(B.ROOT, "source"))
        .filter((n) => n.endsWith(".json")))
        fs.copyFileSync(
          path.join(B.ROOT, "source", name),
          path.join(dir, name),
        );
      const p = path.join(dir, "daily.json"),
        original = fs.readFileSync(p),
        d = JSON.parse(original);
      d.rows.push(d.rows[0]);
      d.rowCount++;
      fs.writeFileSync(p, JSON.stringify(d));
      assert.throws(() => B.build(dir), /Duplicate source day/);
      fs.writeFileSync(p, original);
      const shopPath = path.join(dir, "shop.json"),
        shop = JSON.parse(fs.readFileSync(shopPath));
      shop.data.shop.currencyCode = "EUR";
      fs.writeFileSync(shopPath, JSON.stringify(shop));
      assert.throws(() => B.build(dir), /currency/);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  },
);
