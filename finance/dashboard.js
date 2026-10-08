/* global React, ShopifyFinance, RorCalc */
(function (root) {
  "use strict";
  const F = root.ShopifyFinance,
    h = React.createElement;
  let pending;
  async function load() {
    if (!pending)
      pending = (async () => {
        const m = await fetch("finance/staging/manifest.json", {
          cache: "no-store",
        });
        if (!m.ok) throw Error("Staging manifest unavailable");
        const manifest = await m.json();
        if (!/^snapshots\/[a-f0-9]{64}\.json$/.test(manifest.file))
          throw Error("Invalid snapshot path");
        const response = await fetch("finance/staging/" + manifest.file);
        if (!response.ok) throw Error("Financial snapshot unavailable");
        const bytes = await response.arrayBuffer();
        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (x) => x.toString(16).padStart(2, "0"),
        ).join("");
        if (digest !== manifest.sha256)
          throw Error("Snapshot integrity check failed");
        const data = JSON.parse(new TextDecoder().decode(bytes));
        if (data.id !== manifest.snapshot_id || data.schema !== F.VERSION)
          throw Error("Incompatible financial snapshot");
        return data;
      })();
    try {
      return await pending;
    } catch (error) {
      pending = null;
      throw error;
    }
  }
  const money = (n) =>
    n == null
      ? "Unavailable"
      : new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency: "GBP",
        }).format(n / 100);
  const value = (r, k) =>
    k === "orders"
      ? r[k] == null
        ? "Unavailable"
        : r[k].toLocaleString("en-GB")
      : k === "average_order_value" || k === "net_aov"
        ? money(r[k] == null ? null : r[k] * 100)
        : money(r[k]);
  function table(headers, rows) {
    return h(
      "div",
      { className: "finance-scroll" },
      h(
        "table",
        null,
        h(
          "thead",
          null,
          h("tr", null, ...headers.map((x, i) => h("th", { key: i }, x))),
        ),
        h(
          "tbody",
          null,
          ...rows.map((row, i) =>
            h("tr", { key: i }, ...row.map((x, j) => h("td", { key: j }, x))),
          ),
        ),
      ),
    );
  }
  function FinanceDashboard({ dashboard, state, setState }) {
    const [data, setData] = React.useState(null),
      [error, setError] = React.useState(null);
    React.useEffect(() => {
      let live = true;
      load()
        .then((d) => {
          if (live) setData(d);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
      return () => {
        live = false;
      };
    }, []);
    if (error)
      return h(
        "main",
        { className: "finance" },
        h("h1", null, "Shopify finance unavailable"),
        h("p", { role: "alert" }, error),
        h("a", { href: location.pathname }, "Open original dashboards"),
      );
    if (!data)
      return h(
        "main",
        { className: "finance", role: "status" },
        "Loading verified staging snapshot…",
      );
    const { preset, start, end, metric, section, goal, goalMetric } = state;
    const change = (patch) => setState({ ...state, ...patch });
    const range = RorCalc.resolveDateRange(preset, {
      customStart: start,
      customEnd: end,
      availableStart: data.coverage.start,
      availableEnd: data.coverage.end,
    });
    const r = range.unsupported
      ? null
      : (dashboard === "shopify" ? F.growthReport : F.rorReport)(
          data,
          range.startDate,
          range.endDate,
        );
    const title = dashboard === "shopify" ? "Shopify Growth" : "ROR Sales";
    const card = (key, report = r) =>
      h(
        "div",
        { className: "finance-card", key },
        h("div", null, F.LABELS[key]),
        h(
          "strong",
          { "data-metric": key },
          report ? value(report, key) : "Unavailable",
        ),
      );
    const yesterday = RorCalc.resolveDateRange("yesterday", {}),
      y = F.select(data, yesterday.startDate, yesterday.endDate);
    let comparison = null;
    if (r) {
      const days =
        Math.round((new Date(r.end) - new Date(r.start)) / 86400000) + 1;
      const previous = F.select(
        data,
        F.next(r.start, -days),
        F.next(r.start, -1),
      );
      if (
        r.status === "actual" &&
        previous.status === "actual" &&
        previous[metric]
      )
        comparison =
          ((r[metric] / previous[metric] - 1) * 100).toFixed(1) + "%";
    }
    let content = null;
    if (r && section === "overview")
      content = h(
        React.Fragment,
        null,
        h(
          "div",
          { className: "finance-grid" },
          ...[
            "gross_sales",
            "net_sales",
            "total_sales",
            "orders",
            "net_aov",
            "average_order_value",
          ].map((k) => card(k)),
        ),
        h("h2", null, "Selected financial basis"),
        h(
          "p",
          { "data-testid": "headline" },
          F.LABELS[metric] + ": " + value(r, metric),
        ),
        h(
          "p",
          null,
          "Change against preceding equal-length interval: " +
            (comparison || "Unavailable"),
        ),
        h("h2", null, "Financial components"),
        table(
          ["Metric", "Amount"],
          F.MONEY.map((k) => [F.LABELS[k], value(r, k)]).concat([
            [
              "Other / unexplained total components",
              money(r.component_residual),
            ],
          ]),
        ),
        h("h2", null, "Yesterday · " + yesterday.endDate),
        h(
          "div",
          { className: "finance-grid" },
          card(metric, y),
          card("orders", y),
          card("average_order_value", y),
        ),
        h("h2", null, "Channel contribution"),
        h(
          "p",
          null,
          "Shopify: " +
            value(r, metric) +
            ". Combined-channel financial totals are unavailable until Etsy and NOTHS definitions are reconciled. Their original reports remain available below.",
        ),
      );
    if (r && section === "monthly")
      content = h(
        React.Fragment,
        null,
        h("h2", null, "Monthly financial explorer"),
        h(
          "p",
          null,
          "Boundary months include only the selected dates. Missing coverage suppresses totals.",
        ),
        table(
          [
            "Interval",
            F.LABELS[metric],
            "Orders",
            "Net merchandise AOV",
            "Shopify-reported AOV",
            "Status",
          ],
          F.months(data, r.start, r.end).map((m) => [
            m.start + " → " + m.end,
            value(m, metric),
            value(m, "orders"),
            value(m, "net_aov"),
            value(m, "average_order_value"),
            m.status,
          ]),
        ),
      );
    if (r && section === "products") {
      const p = F.products(data, r.start, r.end, metric);
      content = h(
        React.Fragment,
        null,
        h("h2", null, "Products · " + F.LABELS[metric]),
        h(
          "p",
          { "data-testid": "product-reconciliation" },
          "Product reconciliation: " +
            p.status +
            "; residual " +
            money(p.residual) +
            ". Includes unassigned amounts and adjustments; product orders are not additive.",
        ),
        table(
          ["Product / adjustment", F.LABELS[metric]],
          p.rows.map((x) => [x.title, money(x.value)]),
        ),
      );
    }
    if (r && section === "goals")
      content = h(
        React.Fragment,
        null,
        h("h2", null, "Goal and what-if planning"),
        h(
          "p",
          null,
          "Enter a new goal for this interval and financial basis. Existing total-sales goals are preserved in the original dashboard. This scenario does not change actuals or saved goals.",
        ),
        h(
          "label",
          null,
          "Goal basis ",
          h(
            "select",
            {
              "aria-label": "Goal basis",
              value: goalMetric,
              onChange: (e) => change({ goalMetric: e.target.value }),
            },
            ...["net_sales", "gross_sales", "total_sales"].map((k) =>
              h("option", { key: k, value: k }, F.LABELS[k]),
            ),
          ),
        ),
        h(
          "label",
          null,
          " Goal (£) ",
          h("input", {
            "aria-label": "Goal amount",
            type: "number",
            min: 0,
            step: 0.01,
            value: goal,
            onChange: (e) => change({ goal: e.target.value }),
          }),
        ),
        h(
          "p",
          null,
          goal !== "" && Number(goal) > 0 && r[goalMetric] != null
            ? "Progress: " +
                (r[goalMetric] / Number(goal)).toFixed(1) +
                "%; remaining " +
                money(
                  Math.max(0, Math.round(Number(goal) * 100) - r[goalMetric]),
                )
            : "Enter a positive goal with complete financial coverage.",
        ),
      );
    if (section === "definitions")
      content = h(
        React.Fragment,
        null,
        h("h2", null, "Definitions and evidence"),
        ...Object.entries(F.DEFINITIONS).map(([k, v]) =>
          h("p", { key: k }, h("strong", null, F.LABELS[k] + ": "), v),
        ),
        h(
          "p",
          null,
          "GBP shop currency · Europe/London reporting dates · tax-inclusive store pricing: " +
            String(data.store.taxesIncluded) +
            ". Shopify tax records are retained; historic zero tax is not replaced with an assumed rate.",
        ),
        h(
          "p",
          null,
          "Native aggregate reconciliation passed. Legacy ROR FY26 order variance: +2, unresolved pending secure order-ID extracts. Accounting and publication approval remain pending.",
        ),
        h("p", null, "Snapshot: " + data.id),
        h(
          "p",
          null,
          "Source retrieved: " +
            data.sources.find((x) => x.file === "daily.json").retrieved_at,
        ),
        h(
          "p",
          null,
          "Coverage: " + data.coverage.start + " → " + data.coverage.end,
        ),
        h("a", { href: "docs/pr2/reconciliation.md" }, "Reconciliation report"),
      );
    return h(
      "main",
      {
        className: "finance",
        "data-testid": "canonical-finance",
        "data-dashboard": dashboard,
      },
      h("h1", null, title + " · Shopify financial reporting"),
      h(
        "p",
        { className: "finance-notice" },
        "Staging preview — net merchandise sales is the proposed management default. VAT/accounting mapping and historical publication require approval.",
      ),
      h(
        "p",
        null,
        data.store.domain +
          " · GBP · Europe/London · source through " +
          data.coverage.end,
      ),
      h(
        "div",
        { className: "finance-controls" },
        h(
          "label",
          null,
          "Reporting dates ",
          h(
            "select",
            {
              "aria-label": "Financial date range",
              value: preset,
              onChange: (e) => change({ preset: e.target.value }),
            },
            ...RorCalc.REPORT_DATE_PRESETS.map((p) =>
              h("option", { key: p.key, value: p.key }, p.label),
            ),
          ),
        ),
        preset === "custom" &&
          h(
            React.Fragment,
            null,
            h(
              "label",
              null,
              "From ",
              h("input", {
                "aria-label": "Financial start date",
                type: "date",
                value: start,
                onChange: (e) => change({ start: e.target.value }),
              }),
            ),
            h(
              "label",
              null,
              "To ",
              h("input", {
                "aria-label": "Financial end date",
                type: "date",
                value: end,
                onChange: (e) => change({ end: e.target.value }),
              }),
            ),
          ),
        h(
          "label",
          null,
          "Financial basis ",
          h(
            "select",
            {
              "aria-label": "Financial basis",
              value: metric,
              onChange: (e) => change({ metric: e.target.value }),
            },
            ...["net_sales", "gross_sales", "total_sales"].map((k) =>
              h("option", { key: k, value: k }, F.LABELS[k]),
            ),
          ),
        ),
      ),
      range.unsupported
        ? h("p", { role: "alert" }, range.reason)
        : h(
            "p",
            { "data-testid": "financial-interval" },
            range.startDate +
              " → " +
              range.endDate +
              " (inclusive) · " +
              r.status,
          ),
      r && r.warnings.map((x, i) => h("p", { key: i, role: "status" }, x)),
      h(
        "nav",
        { "aria-label": "Financial sections" },
        ...["overview", "monthly", "products", "goals", "definitions"].map(
          (k) =>
            h(
              "button",
              {
                key: k,
                type: "button",
                "aria-pressed": section === k,
                onClick: () => change({ section: k }),
              },
              k[0].toUpperCase() + k.slice(1),
            ),
        ),
      ),
      content,
      h("hr"),
      h(
        "p",
        null,
        "Original marketing, attribution, margin estimates, marketplace and imported gross-line reports retain their existing calculations.",
      ),
      h(
        "a",
        { href: location.pathname },
        "Open original dashboards and reports",
      ),
    );
  }
  root.CanonicalFinanceDashboard = FinanceDashboard;
})(window);
