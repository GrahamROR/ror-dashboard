// Run with Playwright browser_run_code against localhost:8767.
async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://127.0.0.1:8767/?finance=staging");
  await page.getByTestId("headline").waitFor();
  const presets = await page.evaluate(() =>
    RorCalc.REPORT_DATE_PRESETS.map((x) => x.key),
  );
  let comparisons = 0;
  for (const preset of presets) {
    await page
      .getByLabel("Financial date range", { exact: true })
      .selectOption(preset);
    if (preset === "custom") {
      await page.getByLabel("Financial start date").fill("2026-01-15");
      await page.getByLabel("Financial end date").fill("2026-02-10");
    }
    for (const metric of ["net_sales", "gross_sales", "total_sales"]) {
      await page
        .getByLabel("Financial basis", { exact: true })
        .selectOption(metric);
      await page.getByText("Shopify Growth", { exact: true }).click();
      const before = await page.getByTestId("headline").innerText(),
        period = await page.getByTestId("financial-interval").innerText();
      await page.getByText("ROR Sales", { exact: true }).click();
      if ((await page.getByTestId("headline").innerText()) !== before)
        throw Error("Cross-dashboard amount mismatch");
      if ((await page.getByTestId("financial-interval").innerText()) !== period)
        throw Error("Cross-dashboard dates mismatch");
      comparisons++;
    }
  }
  await page
    .getByLabel("Financial date range", { exact: true })
    .selectOption("previousFY");
  await page
    .getByLabel("Financial basis", { exact: true })
    .selectOption("net_sales");
  for (const dashboard of ["Shopify Growth", "ROR Sales"]) {
    await page.getByText(dashboard, { exact: true }).click();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    if (
      (await page.locator('[data-metric="net_sales"]').first().innerText()) !==
      "£247,999.66"
    )
      throw Error("FY26 source net mismatch");
    if (
      (await page.locator('[data-metric="orders"]').first().innerText()) !==
      "7,832"
    )
      throw Error("FY26 source orders mismatch");
    await page.screenshot({
      path:
        "docs/pr2/screenshots/" +
        (dashboard === "ROR Sales" ? "ror" : "growth") +
        "-fy26.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Monthly", exact: true }).click();
    if (
      !(await page
        .getByRole("cell", { name: "£11,619.67", exact: true })
        .count())
    )
      throw Error("Corrected July net missing");
    await page.getByRole("button", { name: "Products", exact: true }).click();
    if (
      !(await page.getByTestId("product-reconciliation").innerText()).includes(
        "reconciled; residual £0.00",
      )
    )
      throw Error("Products failed reconciliation");
    if (
      !(await page
        .getByRole("cell", {
          name: "Unassigned / non-product adjustments",
          exact: true,
        })
        .count())
    )
      throw Error("Unassigned category lost");
    await page.getByRole("button", { name: "Goals", exact: true }).click();
    await page.getByLabel("Goal amount").fill("300000");
    if (!(await page.locator("main").innerText()).includes("Progress: 82.7%"))
      throw Error("Goal basis calculation failed");
    await page
      .getByRole("button", { name: "Definitions", exact: true })
      .click();
    if (
      !(await page.locator("main").innerText()).includes("order variance: +2")
    )
      throw Error("Unresolved reconciliation hidden");
  }
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page
    .getByLabel("Financial date range", { exact: true })
    .selectOption("custom");
  const checks = [
    ["2025-11-01", "2025-11-30"],
    ["2026-07-01", "2026-07-31"],
    ["2025-12-01", "2025-12-31"],
    ["2026-09-01", "2026-09-30"],
  ];
  for (const [start, end] of checks) {
    await page.getByLabel("Financial start date").fill(start);
    await page.getByLabel("Financial end date").fill(end);
    await page.getByText("Shopify Growth", { exact: true }).click();
    const a = await page.getByTestId("headline").innerText();
    await page.getByText("ROR Sales", { exact: true }).click();
    if (a !== (await page.getByTestId("headline").innerText()))
      throw Error("Manual control month mismatch");
  }
  await page.getByLabel("Financial start date").fill("2023-01-01");
  await page.getByLabel("Financial end date").fill("2023-12-31");
  if (!(await page.getByTestId("headline").innerText()).includes("Unavailable"))
    throw Error("Missing data appeared as real total");
  await page.getByLabel("Financial start date").fill("2026-01-20");
  await page.getByLabel("Financial end date").fill("2026-01-10");
  if (!(await page.getByRole("alert").innerText()).includes("Start date"))
    throw Error("Invalid dates accepted");
  await page
    .getByLabel("Financial date range", { exact: true })
    .selectOption("previousFY");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const section of [
    "Overview",
    "Monthly",
    "Products",
    "Goals",
    "Definitions",
  ]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    if (overflow) throw Error("Mobile overflow: " + section);
  }
  await page.screenshot({
    path: "docs/pr2/screenshots/mobile-definitions.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/finance/staging/manifest.json", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.reload();
  await page.getByRole("alert").waitFor();
  if (
    !(await page.getByRole("alert").innerText()).includes(
      "manifest unavailable",
    )
  )
    throw Error("Fetch failure hidden");
  await page.unroute("**/finance/staging/manifest.json");
  await page.route("**/finance/staging/manifest.json", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.sha256 = "0".repeat(64);
    await route.fulfill({ json: data });
  });
  await page.reload();
  await page.getByRole("alert").waitFor();
  if (!(await page.getByRole("alert").innerText()).includes("integrity"))
    throw Error("Hash failure ignored");
  await page.unroute("**/finance/staging/manifest.json");
  await page.reload();
  await page.getByTestId("headline").waitFor();
  if (errors.length) throw Error(errors.join("; "));
  return {
    presetBasisComparisons: comparisons,
    dashboardSections: 10,
    controlMonths: checks.length,
    mobileSections: 5,
    sourceFailureChecks: 2,
    pageErrors: errors,
  };
};
