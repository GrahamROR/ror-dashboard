"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const E = require("../etsy.js"),
  S = require("../store.js"),
  MP = require("../contract.js"),
  F = require("../../contract.js"),
  FI = require("../../integration.js"),
  C = require("../../../dashboard2/calculations.js"),
  N = require("../noths.js"),
  { collect, londonDay } = require("../collect.js");
const snapshot = S.read(path.join(__dirname, "../staging")),
  controls = require("../etsy-fy26-controls.json"),
  legacy = require("../../../dashboard2/sales-data.json").records;
const opts = {
  channels: ["etsy"],
  startDate: "2025-08-01",
  endDate: "2026-07-31",
  nowDate: "2026-10-12",
};
function records(basis = "net_sales", s = snapshot) {
  return MP.attach(
    FI.rorRecords(
      legacy,
      require("../../staging/" + require("../../staging/manifest.json").file),
      basis,
    ),
    s,
    basis,
  );
}
function synthetic({
  refund = "0.00",
  status = "Completed",
  excluded = false,
  missing = false,
  currency = "GBP",
  duplicate = false,
  timestamp = Date.parse("2026-05-09T23:30:00Z") / 1000,
} = {}) {
  const sold =
    "Sale Date,Order ID,Currency,Order Value,Discount Amount,Shipping,Sales Tax,Order Total,Status\n" +
    (excluded ? "" : `05/09/26,1,${currency},10.00,2.00,1.00,0.00,9.00,\n`);
  const payment =
    "Payment ID,Order ID,Currency,Listing Currency,Exchange Rate,Order Date,Status,Gross Amount,Fees,Refund Amount,Listing Amount\n" +
    `2,1,GBP,GBP,1,05/09/2026,SETTLED,9.00,0.50,${refund},9.00\n`;
  const money = (n) => ({ amount: n, divisor: 100, currency_code: "GBP" }),
    native = new Map([
      [
        "1",
        {
          create_timestamp: timestamp,
          status,
          is_paid: true,
          total_price: money(1000),
          discount_amt: money(200),
          grandtotal: money(900),
        },
      ],
    ]);
  const control = {
    complete: true,
    currency: "GBP",
    timezone: "Europe/London",
    gross_sales: excluded ? 0 : 1000,
    discounts: excluded ? 0 : 200,
    net_sales: excluded ? 0 : 800,
    total_sales: excluded ? 0 : 900,
    shipping: excluded ? 0 : 100,
    tax: 0,
    orders: excluded ? 0 : 1,
  };
  return {
    sold: missing
      ? sold.replace("10.00", "")
      : duplicate
        ? sold + sold.split("\n")[1] + "\n"
        : sold,
    payment,
    native,
    control,
  };
}
function build(x) {
  return E.buildMonth("2026-05", x.sold, x.payment, x.control, x.native);
}
for (const month of Object.keys(controls.monthly_controls))
  test("Etsy workbook and dashboard reconcile " + month, () => {
    const control = controls.monthly_controls[month],
      s = snapshot.channels.etsy.months.find((m) => m.month === month);
    for (const k of E.fields) assert.equal(s[k], control[k]);
    const end = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0))
      .toISOString()
      .slice(0, 10);
    const aggregate = C.aggregate(records(), {
      ...opts,
      startDate: month + "-01",
      endDate: end,
    });
    assert.equal(aggregate.status, "complete");
    assert.equal(Math.round(aggregate.revenue * 100), control.net_sales);
    assert.equal(aggregate.orders, control.orders);
  });
test("Annual source-derived Etsy totals, eligible orders and weighted AOV", () => {
  const r = C.aggregate(records(), opts);
  assert.equal(Math.round(r.revenue * 100), controls.native_stats_revenue);
  assert.equal(r.orders, controls.native_stats_orders);
  assert.equal(r.aov, r.revenue / r.orders);
  assert.equal(r.aov.toFixed(2), "28.92");
});
test("Every basis and daily/monthly/quarterly/annual/custom section uses identical metrics", () => {
  for (const basis of Object.keys(MP.LABELS)) {
    const r = records(basis),
      a = C.aggregate(r, opts);
    const expected =
      snapshot.channels.etsy.daily.reduce((s, x) => s + x[basis], 0) / 100;
    assert.equal(a.revenue, expected);
    assert.equal(a.orders, 1051);
    assert.equal(a.nativeAov, null);
    for (const granularity of [
      "daily",
      "monthly",
      "quarterly",
      "calendar-year",
      "financial-year",
    ]) {
      const comparison = C.buildComparisonTable(r, {
        channels: ["etsy"],
        fromPeriod: opts.startDate,
        toPeriod: opts.endDate,
        granularity,
        metric: "revenue",
        nowDate: opts.nowDate,
      });
      assert.equal(comparison.totals.revenue, expected);
      assert.ok(
        Math.abs(
          comparison.rows.reduce((s, x) => s + x.current.revenue, 0) - expected,
        ) < 1e-8,
      );
      const series = C.buildSeries(r, {
        channels: ["etsy"],
        fromPeriod: opts.startDate,
        toPeriod: opts.endDate,
        granularity,
        metric: "revenue",
        nowDate: opts.nowDate,
      });
      assert.ok(series.series[0].points.length > 0);
      assert.ok(
        Math.abs(
          series.series[0].points.reduce((s, p) => s + p.value, 0) - expected,
        ) < 1e-8,
      );
    }
    const contribution = C.channelContribution(r, opts);
    assert.equal(contribution.totals.revenue, expected);
    assert.equal(contribution.channels[0].pctOfRevenue, 1);
    const custom = C.aggregate(r, {
      ...opts,
      startDate: "2026-05-10",
      endDate: "2026-05-20",
    });
    assert.equal(custom.status, "complete");
    assert.equal(
      custom.revenue,
      snapshot.channels.etsy.daily
        .filter((x) => x.date >= "2026-05-10" && x.date <= "2026-05-20")
        .reduce((s, x) => s + x[basis], 0) / 100,
    );
  }
});
test("P1 all date presets resolve and unavailable Etsy periods never masquerade as zero", () => {
  for (const p of C.REPORT_DATE_PRESETS) {
    const range = C.resolveDateRange(p.key, {
      nowDate: new Date("2026-10-12T10:00:00Z"),
      customStart: "2025-08-01",
      customEnd: "2026-07-31",
    });
    assert.equal(range.unsupported, undefined);
    const a = C.aggregate(records(), { channels: ["etsy"], ...range });
    if (p.key === "previousFY") assert.equal(a.status, "complete");
    else if (a.status !== "complete") assert.equal(a.revenue, null);
  }
});
test("Missing historical/current coverage and failed loads suppress misleading MoM/YoY", () => {
  const missing = C.aggregate(records(), {
    ...opts,
    startDate: "2026-07-01",
    endDate: "2026-08-31",
  });
  assert.equal(missing.status, "incomplete-data");
  assert.equal(missing.revenue, null);
  const newer = C.aggregate(records(), {
    ...opts,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  });
  assert.equal(newer.status, "no-data");
  assert.equal(
    C.compareAggregates(newer, C.aggregate(records(), opts), "revenue")
      .percentChange,
    null,
  );
  assert.equal(C.aggregate(records("net_sales", null), opts).revenue, null);
});
test("Discounts applied once; fees and partial refunds do not reduce verified Stats sales again", () => {
  const m = build(synthetic({ refund: "1.00", status: "Partially Refunded" }));
  assert.equal(m.net_sales, 800);
  assert.equal(m.audit.partial, 1);
  assert.equal(m.audit.fees, 50);
  assert.equal(m.audit.refunds, 100);
});
test("Fully refunded payment-only cancelled order excluded with affirmative source evidence", () => {
  const m = build(
    synthetic({ refund: "9.00", status: "Canceled", excluded: true }),
  );
  assert.equal(m.orders, 0);
  assert.equal(m.net_sales, 0);
  assert.equal(m.audit.excluded, 1);
  assert.throws(
    () => build(synthetic({ refund: "9.00", excluded: true })),
    /cancellation/,
  );
});
test("Blank financial fields, duplicate orders/payments, wrong currencies and unsupported statuses fail closed", () => {
  assert.throws(() => build(synthetic({ missing: true })), /Missing financial/);
  assert.throws(() => build(synthetic({ duplicate: true })), /Duplicate/);
  assert.throws(() => build(synthetic({ currency: "USD" })), /currency/);
  const x = synthetic();
  assert.throws(
    () =>
      E.buildMonth(
        "2026-05",
        x.sold,
        x.payment + x.payment.split("\n")[1] + "\n",
        x.control,
        x.native,
      ),
    /Duplicate/,
  );
  assert.throws(() => build(synthetic({ status: "Canceled" })), /eligibility/);
});
test("Independent source-control mismatch rejects invented adjustments", () => {
  const x = synthetic();
  x.control.net_sales = 799;
  assert.throws(() => build(x), /source-control mismatch/);
  x.control.complete = false;
  assert.throws(() => build(x), /Complete/);
});
test("London DST timestamps override date-only CSV, and missing timestamps never silently use UTC", () => {
  const x = synthetic();
  const m = build(x);
  assert.equal(m.daily.find((r) => r.orders).date, "2026-05-10");
  assert.equal(londonDay("2026-03-29T23:30:00Z"), "2026-03-30");
  assert.equal(londonDay("2026-10-25T23:30:00Z"), "2026-10-25");
  x.native.clear();
  assert.throws(() => build(x), /timestamp/);
});
test("Tax and residual source values are preserved rather than reconstructed at a flat rate", () => {
  const x = synthetic();
  x.sold = x.sold.replace("1.00,0.00,9.00", "1.00,0.20,9.30");
  x.native.get("1").grandtotal.amount = 930;
  x.control.tax = 20;
  x.control.total_sales = 930;
  const m = build(x);
  assert.equal(m.tax, 20);
  assert.equal(m.audit.residual, 10);
  assert.equal(m.net_sales, 800);
});
test("Legacy All Stores revenue/orders/AOV, contributions and Explorer remain unchanged across every basis", () => {
  for (const basis of Object.keys(MP.LABELS)) {
    const r = records(basis),
      all = { ...opts, channels: ["shopify", "etsy", "noths"] },
      a = C.aggregate(r, all),
      b = C.aggregate(legacy, all);
    assert.equal(a.revenue, b.revenue);
    assert.equal(a.orders, b.orders);
    assert.equal(a.aov, b.aov);
    assert.equal(a.financialBasis, "legacy-imported-gross");
    assert.equal(a.revenue.toFixed(2), "466955.48");
    const contrib = C.channelContribution(r, all),
      old = C.channelContribution(legacy, all);
    assert.deepEqual(
      contrib.channels.map((c) => c.revenue),
      old.channels.map((c) => c.revenue),
    );
    for (const metric of ["revenue", "orders", "aov", "units"])
      assert.deepEqual(
        C.buildSeries(r, {
          channels: all.channels,
          fromPeriod: opts.startDate,
          toPeriod: opts.endDate,
          granularity: "monthly",
          metric,
        }),
        C.buildSeries(legacy, {
          channels: all.channels,
          fromPeriod: opts.startDate,
          toPeriod: opts.endDate,
          granularity: "monthly",
          metric,
        }),
      );
  }
});
test("P2 Shopify-only projections and NOTHS legacy remain unchanged", () => {
  for (const basis of Object.keys(MP.LABELS)) {
    const r = records(basis),
      original = FI.rorRecords(legacy, r.finance.snapshot, basis);
    assert.deepEqual(
      C.aggregate(r, { ...opts, channels: ["shopify"] }),
      C.aggregate(original, { ...opts, channels: ["shopify"] }),
    );
    assert.deepEqual(
      C.aggregate(r, { ...opts, channels: ["noths"] }),
      C.aggregate(legacy, { ...opts, channels: ["noths"] }),
    );
  }
});
test("Import failure preserves last-good manifest; immutable snapshots and rollback work", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ror-p3-store-"));
  try {
    const id = S.publish(out, snapshot),
      before = fs.readFileSync(path.join(out, "manifest.json"), "utf8");
    assert.throws(
      () =>
        S.refresh(out, () => {
          throw Error("Missing source");
        }),
      /Missing source/,
    );
    assert.equal(
      fs.readFileSync(path.join(out, "manifest.json"), "utf8"),
      before,
    );
    assert.equal(S.read(out).schema, MP.VERSION);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(out, "refresh-status.json"))).status,
      "failed",
    );
    const modified = structuredClone(snapshot);
    modified.channels.etsy.daily[0].net_sales++;
    const second = S.publish(out, modified);
    assert.notEqual(second, id);
    S.rollback(out, id);
    assert.deepEqual(S.read(out), snapshot);
    fs.appendFileSync(path.join(out, "snapshots", id + ".json"), " ");
    assert.throws(() => S.read(out), /integrity/);
    assert.throws(() => S.rollback(out, id), /integrity/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
test("Failed native read never promotes, exposes credentials or substitutes missing amounts", async () => {
  const opts = {
    channel: "etsy",
    start: "2025-08-01T00:00:00+01:00",
    end: "2026-08-01T00:00:00+01:00",
    env: {
      ETSY_SHOP_ID: "1",
      ETSY_KEYSTRING: "k",
      ETSY_SHARED_SECRET: "s",
      ETSY_ACCESS_TOKEN: "secret",
    },
    fetcher: async () => ({ ok: false, status: 401 }),
  };
  await assert.rejects(collect(opts), /HTTP 401/);
  await assert.rejects(
    collect({
      ...opts,
      fetcher: async () => {
        throw Error("secret");
      },
    }),
    (e) => !e.message.includes("secret"),
  );
  await assert.rejects(collect({ ...opts, env: {} }), /credentials/);
});
test("Native collection completeness, duplicates and source count changes are guarded", async () => {
  const money = { amount: 0, divisor: 100, currency_code: "GBP" };
  const row = {
    receipt_id: 1,
    create_timestamp: 1754040000,
    status: "Completed",
    is_paid: true,
    transactions: [],
    refunds: [],
    grandtotal: money,
    subtotal: money,
    total_price: money,
    total_shipping_cost: money,
    total_tax_cost: money,
    total_vat_cost: money,
    discount_amt: money,
  };
  let calls = 0;
  const base = {
    channel: "etsy",
    start: "2025-08-01T00:00:00+01:00",
    end: "2026-08-01T00:00:00+01:00",
    env: {
      ETSY_SHOP_ID: "1",
      ETSY_KEYSTRING: "k",
      ETSY_SHARED_SECRET: "s",
      ETSY_ACCESS_TOKEN: "t",
    },
  };
  const response = (b) => ({ ok: true, json: async () => b });
  const good = await collect({
    ...base,
    fetcher: async () => response({ count: 1, results: [row] }),
  });
  assert.equal(good.rows.length, 1);
  await assert.rejects(
    collect({
      ...base,
      fetcher: async () => response({ count: 2, results: [row, row] }),
    }),
    /Duplicate/,
  );
  await assert.rejects(
    collect({
      ...base,
      fetcher: async () =>
        response({
          count: 2,
          results: calls++ ? [{ ...row, receipt_id: 2 }] : [row],
        }),
      maxPages: 1,
    }),
    /incomplete/,
  );
  calls = 0;
  await assert.rejects(
    collect({
      ...base,
      fetcher: async () =>
        response({
          count: calls++ ? 3 : 2,
          results: [{ ...row, receipt_id: calls }],
        }),
    }),
    /count changed/,
  );
});
test("NOTHS every native monthly gross equals item gross plus delivery; net stays unreconciled", () => {
  const n = require("../noths-fy26-investigation.json"),
    c = require("../noths-fy26-controls.json");
  for (const [month, m] of Object.entries(n.months)) {
    assert.equal(m.item_gross + m.delivery, c.monthly_gross[month]);
    assert.equal(m.unresolved_native_gross_difference, 0);
  }
  assert.equal(n.status, "unreconciled");
  assert.equal(n.totals.orders, 3786);
  assert.equal(n.totals.item_plus_delivery, n.totals.native_report_gross);
  assert.notEqual(n.product_report_gross, n.totals.order_total);
  assert.throws(
    () =>
      N.money({
        cents: 100,
        currency: { iso_code: "USD", subunit_to_unit: 100 },
      }),
    /unsupported/,
  );
  assert.throws(() => N.money(null), /Missing/);
  assert.throws(() => N.inspect([{ id: 1 }, { id: 1 }], c));
});
test("Single-store contribution donut draws a full ring; multi-store geometry preserved", () => {
  const vm = require("node:vm");
  const context = vm.createContext({
    window: {},
    useState: () => [null, () => {}],
    el: (type, props, ...children) => ({ type, props, children }),
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../../../dashboard2/charts.js"),
      "utf8",
    ),
    context,
  );
  const draw = (slices) =>
    context.window.RorCharts.DonutChart({ slices, formatValue: String });
  const one = draw([{ value: 100, color: "purple", label: "Etsy" }]);
  const pathNode = one.children[0].children[0][0];
  assert.equal((pathNode.props.d.match(/ A/g) || []).length, 4);
  const multi = draw([
    { value: 60, color: "blue", label: "Shopify" },
    { value: 40, color: "purple", label: "Etsy" },
  ]);
  assert.equal(
    (multi.children[0].children[0][0].props.d.match(/ A/g) || []).length,
    2,
  );
});
test("Etsy plus NOTHS cannot mix validated Etsy net with unreconciled marketplace gross", () => {
  const opts = {
    channels: ["etsy", "noths"],
    startDate: "2025-08-01",
    endDate: "2026-07-31",
  };
  const r = records(),
    a = C.aggregate(r, opts),
    b = C.aggregate(legacy, opts);
  assert.equal(a.revenue, b.revenue);
  const shares = C.channelContribution(r, opts);
  assert.deepEqual(
    shares.channels.map((c) => c.revenue),
    C.channelContribution(legacy, opts).channels.map((c) => c.revenue),
  );
});
test("Native candidate collection rejects missing financial fields rather than presenting complete data", () => {
  const { etsyReceipt, nothsOrder } = require("../collect.js");
  assert.throws(
    () => etsyReceipt({ receipt_id: 1, transactions: [], refunds: [] }),
    /Missing/,
  );
  assert.throws(() => nothsOrder({ id: 1, items: [] }), /Missing/);
});
test("Extra native receipt absent from paired exports blocks incomplete source coverage", () => {
  const x = synthetic();
  x.native.set("3", { ...x.native.get("1") });
  assert.throws(() => build(x), /missing paired/);
});
