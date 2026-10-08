const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const F = require("../contract"),
  I = require("../integration"),
  C = require("../../dashboard2/calculations"),
  B = require("../build-staging"),
  R = require("../refresh");
const manifest = require("../staging/manifest.json"),
  s = require("../staging/" + manifest.file),
  raw = require("../../data.json"),
  legacy = require("../../dashboard2/sales-data.json").records;
const now = new Date("2026-10-08T12:00:00Z");
function view(fy) {
  return {
    fy,
    ...raw.years[fy],
    yesterday: fy === raw.currentFY ? raw.yesterday : null,
    updated: raw.updated,
  };
}
test("FY26 original Growth sections and ROR all consume identical canonical values for each basis", () => {
  for (const basis of I.BASIS) {
    const v = I.growthView(view("FY26"), s, basis, now),
      records = I.rorRecords(legacy, s, basis),
      opts = {
        channels: ["shopify"],
        startDate: "2025-08-01",
        endDate: "2026-07-31",
      };
    const agg = C.aggregate(records, opts),
      table = C.buildComparisonTable(records, {
        ...opts,
        fromPeriod: opts.startDate,
        toPeriod: opts.endDate,
        granularity: "monthly",
        metric: "revenue",
      }),
      contribution = C.channelContribution(records, opts),
      series = C.buildSeries(records, {
        ...opts,
        fromPeriod: opts.startDate,
        toPeriod: opts.endDate,
        granularity: "monthly",
        metric: "revenue",
        seriesMode: "combined",
      });
    assert.equal(v.summary.ytdRevenue, agg.revenue);
    assert.equal(v.summary.ytdOrders, agg.orders);
    assert.equal(table.totals.revenue, agg.revenue);
    assert.equal(contribution.channels[0].revenue, agg.revenue);
    assert.equal(contribution.channels[0].orders, agg.orders);
    assert.ok(
      Math.abs(
        series.series[0].points.reduce((n, p) => n + p.value, 0) - agg.revenue,
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(v.monthly.reduce((n, m) => n + m.revenue, 0) - agg.revenue) <
        1e-8,
    );
    for (const m of v.monthly) {
      const row = table.rows.find((r) => r.bucket.startDate === m.key + "-01");
      assert.equal(m.revenue, row.current.revenue);
      assert.equal(m.orders, row.current.orders);
    }
    assert.equal(v.summary.avgAOV, 32.22);
    assert.equal(v.summary.netAov, 247999.66 / 7832);
    assert.equal(agg.aov, agg.revenue / agg.orders);
    assert.equal(v.finance.productResidual, 0);
    assert.equal(v.topProducts.length, 10);
  }
});
test("All eleven presets and custom intervals preserve consistent existing ROR KPIs/table/explorer totals for all three bases", () => {
  for (const basis of I.BASIS)
    for (const p of C.REPORT_DATE_PRESETS) {
      const r = C.resolveDateRange(p.key, {
          nowDate: now,
          customStart: "2026-01-15",
          customEnd: "2026-02-10",
        }),
        records = I.rorRecords(legacy, s, basis),
        native = I.report(s, r.startDate, r.endDate, basis);
      const a = C.aggregate(records, {
        channels: ["shopify"],
        startDate: r.startDate,
        endDate: r.endDate,
        nowDate: "2026-10-08",
      });
      assert.equal(a.revenue, native.revenue);
      assert.equal(a.orders, native.orders);
      const t = C.buildComparisonTable(records, {
        channels: ["shopify"],
        fromPeriod: r.startDate,
        toPeriod: r.endDate,
        granularity: "monthly",
        metric: "revenue",
      });
      assert.equal(t.totals.revenue, native.revenue);
      assert.equal(t.totals.orders, native.orders);
    }
});
test("Basis changes do not change orders, purchased units, sessions, conversions, attribution or fixed goal input", () => {
  const input = JSON.stringify(raw),
    recordsBefore = JSON.stringify(legacy);
  const values = I.BASIS.map((b) => I.growthView(view("FY26"), s, b, now));
  for (const v of values) {
    assert.equal(v.summary.ytdOrders, 7832);
    assert.equal(v.summary.ytdSessions, raw.years.FY26.summary.ytdSessions);
    assert.equal(
      v.summary.avgConversionRate,
      raw.years.FY26.summary.avgConversionRate,
    );
    assert.equal(
      v.summary.ytdCostOfGoodsSold,
      raw.years.FY26.summary.ytdCostOfGoodsSold,
    );
    assert.equal(v.monthly[11].sessions, raw.years.FY26.monthly[11].sessions);
  }
  assert.equal(JSON.stringify(raw), input);
  assert.equal(JSON.stringify(legacy), recordsBefore);
  for (const basis of I.BASIS) {
    const a = C.aggregate(I.rorRecords(legacy, s, basis), {
      channels: ["shopify"],
      startDate: "2025-08-01",
      endDate: "2026-07-31",
    });
    assert.equal(a.units, 11893);
  }
  const total = I.growthView(view("FY26"), s, "total_sales", now);
  assert.equal(total.summary.ytdRevenue, 313437.06);
  assert.equal(total.summary.basisAov, 313437.06 / 7832);
});
test("Etsy and NOTHS retain byte-equivalent imported aggregates and combined net/total revenue is never shown", () => {
  for (const basis of I.BASIS) {
    const records = I.rorRecords(legacy, s, basis),
      opts = { startDate: "2025-08-01", endDate: "2026-07-31" };
    for (const channel of ["etsy", "noths"])
      assert.deepEqual(
        C.aggregate(records, { ...opts, channels: [channel] }),
        C.aggregate(legacy, { ...opts, channels: [channel] }),
      );
    const all = C.aggregate(records, {
      ...opts,
      channels: ["shopify", "etsy", "noths"],
    });
    assert.equal(all.revenue, null);
    assert.equal(all.aov, null);
    assert.match(all.note, /Combined/);
    const contribution = C.channelContribution(records, {
      ...opts,
      channels: ["shopify", "etsy", "noths"],
    });
    assert.ok(contribution.channels.every((c) => c.pctOfRevenue === null));
    assert.equal(
      contribution.channels[0].revenue,
      I.report(s, opts.startDate, opts.endDate, basis).revenue,
    );
  }
});
test("Missing finance cannot fall back to stale financial facts; units/marketplace facts remain", () => {
  const records = I.rorRecords(legacy, null, "net_sales", "Source unavailable"),
    a = C.aggregate(records, {
      channels: ["shopify"],
      startDate: "2025-08-01",
      endDate: "2026-07-31",
    });
  assert.equal(a.revenue, null);
  assert.equal(a.orders, null);
  assert.equal(a.status, "incomplete-data");
  assert.match(a.note, /Source unavailable/);
  assert.equal(a.units, 11893);
  const v = I.growthView(view("FY26"), null, "net_sales", now);
  assert.equal(v.summary.ytdRevenue, null);
  assert.equal(v.summary.avgAOV, null);
  assert.equal(v.summary.ytdSessions, 267714);
  assert.equal(v.topProducts.length, 0);
});
test("Missing dates and partial imported units suppress comparison without changing verified financial counts", () => {
  const records = I.rorRecords(legacy, s, "net_sales"),
    a = C.aggregate(records, {
      channels: ["shopify"],
      startDate: "2023-01-01",
      endDate: "2023-12-31",
    });
  assert.equal(a.revenue, null);
  assert.equal(C.compareAggregates(a, a, "revenue").percentChange, null);
  const last = C.aggregate(records, {
    channels: ["shopify"],
    startDate: "2026-10-07",
    endDate: "2026-10-07",
  });
  assert.equal(last.orders, 15);
  assert.equal(last.status, "complete");
  assert.equal(last.unitsStatus, "partial");
  assert.equal(C.compareAggregates(last, last, "units").percentChange, null);
  const clipped = C.buildComparisonTable(records, {
    channels: ["shopify"],
    fromPeriod: "2026-01-15",
    toPeriod: "2026-02-10",
    granularity: "monthly",
    metric: "revenue",
  });
  assert.equal(clipped.rows[0].mom.percentChange, null);
});
test("Yesterday financial fields use the same source and basis while session/margin inputs retain existing behavior", () => {
  for (const basis of I.BASIS) {
    const v = I.growthView(view("FY27"), s, basis, now),
      a = C.aggregate(I.rorRecords(legacy, s, basis), {
        channels: ["shopify"],
        startDate: "2026-10-07",
        endDate: "2026-10-07",
      });
    assert.equal(v.yesterday.revenue, a.revenue);
    assert.equal(v.yesterday.orders, a.orders);
    assert.equal(
      v.yesterday.aov,
      F.select(s, "2026-10-07", "2026-10-07").average_order_value,
    );
    assert.equal(v.yesterday.sessions, raw.yesterday.sessions);
    assert.equal(v.yesterday.margin, raw.yesterday.margin);
  }
});
function synthetic(dir, refund = 0) {
  const names = [...F.ADDITIVE, "average_order_value"];
  const facts = [
    ["2025-12-31", "100", "-10", "0", "90", "5", "19", "114", "2", "45"],
    [
      "2026-01-01",
      "0",
      "0",
      String(-refund),
      String(-refund),
      "0",
      String(-refund / 5),
      String(-refund * 1.2),
      "0",
      "0",
    ],
  ];
  const total = {
    gross_sales: 100,
    discounts: -10,
    sales_reversals: -refund,
    net_sales: 90 - refund,
    shipping_charges: 5,
    taxes: 19 - refund / 5,
    total_sales: 114 - refund * 1.2,
    orders: 2,
    average_order_value: 45,
  };
  const table = (columns, rows, query) => ({
    query,
    columns: columns.map((name) => ({ name, dataType: "fixture" })),
    rows,
    rowCount: rows.length,
    shopDomain: "test.myshopify.com",
    retrieved_at: "2026-01-02T00:00:00Z",
    transport: "synthetic test fixture",
  });
  fs.mkdirSync(dir, { recursive: true });
  const output = {
    "shop.json": {
      data: {
        shop: {
          id: "fixture",
          myshopifyDomain: "test.myshopify.com",
          currencyCode: "GBP",
          ianaTimezone: "Europe/London",
          taxesIncluded: true,
        },
      },
    },
    "daily.json": table(
      ["day", ...names],
      facts,
      "FROM sales SINCE 2025-12-31 UNTIL 2026-01-01",
    ),
    "monthly.json": table(
      ["month", ...names],
      facts.map((r) => [r[0].slice(0, 7) + "-01", ...r.slice(1)]),
      "FROM sales SINCE 2025-12-31 UNTIL 2026-01-01",
    ),
    "period-selection.json": table(
      names,
      [names.map((n) => String(total[n]))],
      "FROM sales SINCE 2025-12-31 UNTIL 2026-01-01",
    ),
    "products-daily.json": table(
      ["day", "product_title", ...F.MONEY],
      facts.map((r) => [r[0], "fixture", ...r.slice(1, 8)]),
      "FROM sales SINCE 2025-12-31 UNTIL 2026-01-01",
    ),
  };
  for (const [name, data] of Object.entries(output))
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
  return output;
}
test("Late adjustments refresh all retained history, preserve old immutable snapshots and rollback safely", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ror-refresh-")),
    source = path.join(temp, "capture"),
    root = path.join(temp, "staging");
  try {
    synthetic(source);
    const first = await R.refresh({
      root,
      sourceDir: source,
      now: new Date("2026-01-02T12:00:00Z"),
    });
    const oldBytes = fs.readFileSync(path.join(root, first.manifest.file));
    synthetic(source, 25);
    const next = await R.refresh({
      root,
      sourceDir: source,
      now: new Date("2026-01-03T12:00:00Z"),
    });
    assert.notEqual(first.manifest.snapshot_id, next.manifest.snapshot_id);
    assert.equal(
      next.manifest.previous_snapshot_id,
      first.manifest.snapshot_id,
    );
    assert.deepEqual(
      fs.readFileSync(path.join(root, first.manifest.file)),
      oldBytes,
    );
    const current = JSON.parse(
      fs.readFileSync(path.join(root, next.manifest.file)),
    );
    assert.equal(F.select(current, "2025-12-31", "2026-01-01").net_sales, 6500);
    assert.equal(F.select(current, "2025-12-31", "2025-12-31").net_sales, 9000);
    assert.equal(F.select(current, "2025-12-31", "2026-01-01").orders, 2);
    require("../rollback").rollback(first.manifest.snapshot_id, root);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, "manifest.json"))).snapshot_id,
      first.manifest.snapshot_id,
    );
  } finally {
    fs.rmSync(temp, { recursive: true });
  }
});
test("Failed reconciliation keeps last good pointer, records failure and never changes production exports", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ror-failed-refresh-")),
    source = path.join(temp, "capture"),
    root = path.join(temp, "staging");
  try {
    synthetic(source);
    await R.refresh({ root, sourceDir: source });
    const pointer = fs.readFileSync(path.join(root, "manifest.json"));
    const p = path.join(source, "daily.json"),
      data = JSON.parse(fs.readFileSync(p));
    data.rows.pop();
    data.rowCount--;
    fs.writeFileSync(p, JSON.stringify(data));
    await assert.rejects(
      R.refresh({ root, sourceDir: source }),
      /reconciliation/,
    );
    assert.deepEqual(
      fs.readFileSync(path.join(root, "manifest.json")),
      pointer,
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(root, "refresh-status.json")))
        .status,
      "failed",
    );
    await assert.rejects(
      R.refresh({ root: path.resolve(__dirname, "../.."), sourceDir: source }),
      /forbidden/,
    );
  } finally {
    fs.rmSync(temp, { recursive: true });
  }
});
test("Full-history partitioning includes all prior dates and London reporting-day boundaries", () => {
  assert.deepEqual(R.ranges("2025-12-31", "2026-01-02"), [
    { start: "2025-12-31", end: "2025-12-31" },
    { start: "2026-01-01", end: "2026-01-02" },
  ]);
  assert.equal(R.endYesterday(new Date("2026-03-29T23:30:00Z")), "2026-03-29");
  assert.equal(R.endYesterday(new Date("2026-10-25T00:30:00Z")), "2026-10-24");
});
test("Refresh uses existing client credentials without logging secrets and reports auth failures safely", async () => {
  const token = await R.accessToken(
    {
      SHOPIFY_STORE: "test",
      SHOPIFY_CLIENT_ID: "fixture-id",
      SHOPIFY_CLIENT_SECRET: "fixture-secret",
    },
    async (url, opts) => {
      assert.match(url, /oauth\/access_token/);
      assert.equal(JSON.parse(opts.body).grant_type, "client_credentials");
      return {
        ok: true,
        json: async () => ({ access_token: "fixture-token" }),
      };
    },
  );
  assert.equal(token, "fixture-token");
  await assert.rejects(
    R.accessToken(
      {
        SHOPIFY_STORE: "test",
        SHOPIFY_CLIENT_ID: "fixture-id",
        SHOPIFY_CLIENT_SECRET: "fixture-secret",
      },
      async () => ({ ok: false, status: 401 }),
    ),
    /HTTP 401/,
  );
});
test("Transport refresh partitions full history and validates independent monthly/FY/product controls before publishing", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ror-partition-")),
    fixture = synthetic(path.join(temp, "fixture"), 25),
    queries = [];
  const transport = async (url, opts) => {
    const req = JSON.parse(opts.body);
    let data;
    if (!req.variables.query) data = fixture["shop.json"].data;
    else {
      const q = req.variables.query;
      queries.push(q);
      const [, start, end] = /SINCE (\S+) UNTIL (\S+)/.exec(q),
        product = q.includes("product_title"),
        daily = q.includes("TIMESERIES day"),
        monthly = q.includes("TIMESERIES month");
      const source =
        fixture[
          product
            ? "products-daily.json"
            : monthly
              ? "monthly.json"
              : "daily.json"
        ];
      let columns = source.columns,
        rows = source.rows.filter((r) => r[0] >= start && r[0] <= end);
      if (!product && !daily && !monthly) {
        const names = [...F.ADDITIVE, "average_order_value"];
        columns = names.map((name) => ({ name, dataType: "fixture" }));
        const facts = fixture["daily.json"].rows.filter(
          (r) => r[0] >= start && r[0] <= end,
        );
        rows = [
          names.map((n, i) =>
            String(
              n === "average_order_value"
                ? 45
                : facts.reduce((sum, r) => sum + Number(r[i + 1]), 0),
            ),
          ),
        ];
      }
      data = {
        shopifyqlQuery: { tableData: { columns, rows }, parseErrors: [] },
      };
    }
    return { ok: true, status: 200, json: async () => ({ data }) };
  };
  try {
    const dir = await R.captureHistory({
      domain: "test.myshopify.com",
      token: "fixture-token",
      start: "2025-12-31",
      end: "2026-01-01",
      root: temp,
      transport,
    });
    const snapshot = B.build(dir);
    assert.equal(
      F.select(snapshot, "2025-12-31", "2026-01-01").net_sales,
      6500,
    );
    assert.equal(snapshot.coverage.end, "2026-01-01");
    assert.equal(
      snapshot.sources.find((x) => x.file === "daily.json").partitions.length,
      2,
    );
    assert.ok(
      queries.some((q) => q.includes("SINCE 2025-12-31 UNTIL 2025-12-31")),
    );
    assert.ok(
      queries.some(
        (q) =>
          !q.includes("TIMESERIES") &&
          !q.includes("GROUP BY") &&
          q.includes("SINCE 2025-12-31 UNTIL 2026-01-01"),
      ),
    );
  } finally {
    fs.rmSync(temp, { recursive: true });
  }
});
