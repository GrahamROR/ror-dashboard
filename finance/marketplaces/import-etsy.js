// Controlled, local staging importer. No network, database or production writes.
"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  E = require("./etsy.js"),
  S = require("./store.js");
function run({ soldDir, paymentDir, controls, out, nativeFile }) {
  return S.refresh(out, (previous) => {
    const c = JSON.parse(fs.readFileSync(controls));
    const native = JSON.parse(fs.readFileSync(nativeFile));
    if (native.rows.length !== native.count)
      throw Error("Incomplete native receipt collection");
    const map = new Map(native.rows.map((r) => [r.receipt_id, r]));
    if (map.size !== native.rows.length)
      throw Error("Duplicate native receipts");

    const { londonDay } = require("./collect.js");
    for (const bound of [native.start, native.end])
      if (
        !bound ||
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/London",
          hourCycle: "h23",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(bound)) !== "00:00:00"
      )
        throw Error("Complete native London-midnight scope required");
    const paymentIds = new Set();
    const supplied = Object.entries(c.monthly_controls).map(
      ([month, control]) => {
        const nextMonth = new Date(
          Date.UTC(+month.slice(0, 4), +month.slice(5), 1),
        )
          .toISOString()
          .slice(0, 10);
        if (
          londonDay(native.start) > month + "-01" ||
          londonDay(native.end) < nextMonth
        )
          throw Error("Native scope does not cover complete declared month");
        const suffix =
          month.slice(0, 4) + "-" + Number(month.slice(5)) + ".csv";
        const paymentText = fs.readFileSync(
          path.join(paymentDir, "EtsyDirectCheckoutPayments" + suffix),
          "utf8",
        );
        for (const row of E.csv(paymentText)) {
          if (paymentIds.has(row["Payment ID"]))
            throw Error("Duplicate payment across source months");
          paymentIds.add(row["Payment ID"]);
        }
        return E.buildMonth(
          month,
          fs.readFileSync(
            path.join(soldDir, "EtsySoldOrders" + suffix),
            "utf8",
          ),
          fs.readFileSync(
            path.join(paymentDir, "EtsyDirectCheckoutPayments" + suffix),
            "utf8",
          ),
          control,
          map,
        );
      },
    );
    if (!supplied.length) throw Error("No verified source periods");
    if (
      c.native_stats_revenue != null &&
      supplied.reduce((s, m) => s + m.net_sales, 0) !== c.native_stats_revenue
    )
      throw Error("Native Stats revenue mismatch");
    if (
      c.native_stats_orders != null &&
      supplied.reduce((s, m) => s + m.orders, 0) !== c.native_stats_orders
    )
      throw Error("Native Stats orders mismatch");
    // Replace only declared complete months; immutable prior snapshots remain available.
    const replacing = new Set(supplied.map((m) => m.month));
    const retained = (previous?.channels.etsy.months || [])
      .filter((m) => !replacing.has(m.month))
      .map((m) => ({
        ...m,
        daily: previous.channels.etsy.daily.filter((r) =>
          r.date.startsWith(m.month),
        ),
      }));
    return E.snapshot([...retained, ...supplied]);
  });
}
if (require.main === module) {
  const [
    soldDir,
    paymentDir,
    controls,
    nativeFile,
    out = "finance/marketplaces/staging",
  ] = process.argv.slice(2);
  if (!soldDir || !paymentDir || !controls || !nativeFile)
    throw Error(
      "Usage: node finance/marketplaces/import-etsy.js SOLD_DIR PAYMENT_DIR CONTROLS_JSON NATIVE_RECEIPTS_JSON [STAGING_OUT]",
    );
  console.log(
    JSON.stringify({
      snapshot: run({ soldDir, paymentDir, controls, out, nativeFile }),
    }),
  );
}
module.exports = { run };
