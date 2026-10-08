// Existing interface acceptance, executed by Playwright against ports 8766 (P1 baseline) and 8767 (P2).
async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const dir = "/tmp/ror-pr2-review/docs/pr2/screenshots/";
  const tabs = [
    "Overview",
    "Yesterday",
    "Monthly",
    "Products",
    "Email",
    "Ads",
    "Margin",
  ];
  const tab = async (name) => {
    await page.getByText(name, { exact: true }).first().click();
  };
  const shot = async (name) =>
    page.screenshot({
      path: dir + name + ".png",
      fullPage: true,
      animations: "disabled",
    });
  const overflow = async () =>
    page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  // Matched baseline and corrected screenshots for every original Growth tab, plus ROR.
  for (const [port, prefix] of [
    [8766, "before"],
    [8767, "after"],
  ]) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("http://127.0.0.1:" + port + "/");
    await page.getByRole("button", { name: "FY26", exact: true }).click();
    for (const name of tabs) {
      await tab(name);
      await shot(prefix + "-growth-" + name.toLowerCase());
    }
    await tab("ROR Sales");
    await page
      .getByLabel("Page date range", { exact: true })
      .selectOption("previousFY");
    await (
      prefix === "after"
        ? page.getByLabel("Page store", { exact: true })
        : page
            .locator("select")
            .filter({ has: page.locator('option[value="all"]') })
            .first()
    ).selectOption("shopify");
    await page
      .getByLabel("Sales comparison date range", { exact: true })
      .selectOption("previousFY");
    await page
      .getByLabel("Sales explorer date range", { exact: true })
      .selectOption("previousFY");
    // P1 did not label its store controls: select the explorer's legacy store by its option set.
    if (prefix === "after")
      await page
        .getByLabel("Sales explorer store", { exact: true })
        .selectOption("shopify");
    else
      await page
        .locator("select")
        .filter({ has: page.locator('option[value="all"]') })
        .last()
        .selectOption("shopify");
    await shot(prefix + "-ror-shopify");
    await (
      prefix === "after"
        ? page.getByLabel("Page store", { exact: true })
        : page
            .locator("select")
            .filter({ has: page.locator('option[value="all"]') })
            .first()
    ).selectOption("all");
    await shot(prefix + "-ror-all");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(prefix + "-ror-mobile");
    if (await overflow()) throw Error(prefix + " ROR mobile overflow");
    await tab("Shopify Growth");
    await tab("Overview");
    await shot(prefix + "-growth-mobile");
    if (await overflow()) throw Error(prefix + " Growth mobile overflow");
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("http://127.0.0.1:8767/?finance=staging");
  await page.getByRole("button", { name: "FY26", exact: true }).click();
  // Former replacement URL still renders the original seven-tab application.
  for (const name of tabs)
    if (!(await page.getByText(name, { exact: true }).first().count()))
      throw Error("Original tab absent: " + name);
  if (
    await page.getByText("Back to original dashboard", { exact: false }).count()
  )
    throw Error("Replacement finance navigation remains");
  let yearlyBasisChecks = 0;
  for (const basis of ["net_sales", "gross_sales", "total_sales"]) {
    await page
      .getByLabel("Shopify financial basis", { exact: true })
      .selectOption(basis);
    const expected = await page.evaluate(async (b) => {
      const s = await ShopifyFinanceLoader.load();
      return ShopifyIntegration.report(s, "2025-08-01", "2026-07-31", b);
    }, basis);
    const amount = expected.revenue.toLocaleString("en-GB", {
      style: "currency",
      currency: "GBP",
    });
    if (!(await page.locator("body").innerText()).includes(amount))
      throw Error("Growth FY amount missing " + basis);
    const modelBefore = await page
      .locator("input[type=range]")
      .evaluateAll((ns) => ns.map((n) => n.value));
    await tab("Monthly");
    if (!(await page.locator("table tfoot").innerText()).includes(amount))
      throw Error("Monthly FY total mismatch");
    await tab("Overview");
    if (
      JSON.stringify(modelBefore) !==
      JSON.stringify(
        await page
          .locator("input[type=range]")
          .evaluateAll((ns) => ns.map((n) => n.value)),
      )
    )
      throw Error("Model assumptions changed");
    await tab("ROR Sales");
    await page
      .getByLabel("Page store", { exact: true })
      .selectOption("shopify");
    await page
      .getByLabel("Page date range", { exact: true })
      .selectOption("previousFY");
    const revenue = await page
      .locator('[data-ror-metric="revenue"]')
      .innerText();
    if (!revenue.includes(amount)) throw Error("ROR FY mismatch " + basis);
    if (
      !(await page.locator('[data-ror-metric="orders"]').innerText()).includes(
        "7,832",
      )
    )
      throw Error("Eligible order mismatch");
    await tab("Shopify Growth");
    await page.getByRole("button", { name: "FY26", exact: true }).click();
    yearlyBasisChecks++;
  }
  // Sliders and goal lock keep their original interaction and restore their inputs.
  await tab("Overview");
  const sliders = page.locator("input[type=range]");
  for (const i of [0, 1]) {
    const previous = await sliders.nth(i).inputValue();
    await sliders.nth(i).fill(i === 0 ? "0.035" : "48");
    if ((await sliders.nth(i).inputValue()) === previous)
      throw Error("Slider did not change");
    await sliders.nth(i).fill(previous);
  }
  const goal = sliders.nth(2);
  if ((await goal.evaluate((n) => n.style.pointerEvents)) !== "none")
    throw Error("Goal lock missing");
  await page.getByRole("button", { name: "Locked", exact: true }).click();
  await goal.fill("550000");
  if ((await goal.inputValue()) !== "550000") throw Error("Goal slider broken");
  await goal.fill("500000");
  await page
    .getByRole("button", { name: "Unlocked", exact: true })
    .last()
    .click();
  if ((await goal.evaluate((n) => n.style.pointerEvents)) !== "none")
    throw Error("Goal relock failed");
  await tab("Email");
  for (const table of await page.locator("table").all()) {
    for (const header of await table.locator("th").all()) await header.click();
  }
  await tab("Ads");
  const adsSelect = value => page.locator("select").filter({has:page.locator('option[value="'+value+'"]')});
  for (const grain of ["daily","weekly","monthly"]) await adsSelect("daily").selectOption(grain);
  for (const channel of ["meta","google","all"]) await adsSelect("meta").selectOption(channel);
  for (const metric of ["spend","conversions","conversionValue","roas","cpa","clicks"]) await adsSelect("spend").selectOption(metric);
  await adsSelect("combined").selectOption("byChannel");
  for (const comparison of ["none","previous-period","previous-year"]) await adsSelect("previous-period").selectOption(comparison);
  for (const chart of ["Bar","Line","Stacked bar","Area"]) await page.getByText(chart,{exact:true}).first().click();
  await adsSelect("last30").selectOption("yesterday");
  const daily = await page.evaluate(async () => { const s=await ShopifyFinanceLoader.load();const day=RorCalc.dateKeyFromDate(new Date());const yesterday=ShopifyFinance.next(day,-1);return ShopifyIntegration.report(s,yesterday,yesterday,"net_sales"); });
  const actuals=await page.locator(".card").filter({hasText:"Shopify actuals, for comparison"}).innerText();
  if(!actuals.includes(daily.orders.toLocaleString("en-GB")))throw Error("Ads eligible orders not canonical");
  await tab("Margin");if(!(await page.locator("body").innerText()).includes("Estimated LTV"))throw Error("Margin LTV features absent");
  // ROR: all three controls x eleven presets x all bases, including custom and partial intervals.
  await tab("ROR Sales");
  await page.getByLabel("Page store", { exact: true }).selectOption("shopify");
  await page
    .getByLabel("Sales explorer store", { exact: true })
    .selectOption("shopify");
  const presets = await page.evaluate(() => RorCalc.REPORT_DATE_PRESETS);
  let selections = 0;
  for (const basis of ["net_sales", "gross_sales", "total_sales"]) {
    await page
      .getByLabel("ROR Shopify financial basis", { exact: true })
      .selectOption(basis);
    for (const preset of presets) {
      for (const name of ["Page", "Sales comparison", "Sales explorer"]) {
        const control = page.getByLabel(name + " date range", { exact: true });
        const options = await control
          .locator("option")
          .evaluateAll((ns) => ns.map((n) => n.value));
        if (
          JSON.stringify(options) !== JSON.stringify(presets.map((p) => p.key))
        )
          throw Error("Preset options differ");
        await control.selectOption(preset.key);
        if (preset.key === "custom") {
          await page
            .getByLabel(name + " start date", { exact: true })
            .fill("2026-01-15");
          await page
            .getByLabel(name + " end date", { exact: true })
            .fill("2026-02-10");
        }
        selections++;
      }
      const expected = await page.evaluate(
        async (arg) => {
          const r = RorCalc.resolveDateRange(arg.key, {
            customStart: "2026-01-15",
            customEnd: "2026-02-10",
          });
          return ShopifyIntegration.report(
            await ShopifyFinanceLoader.load(),
            r.startDate,
            r.endDate,
            arg.basis,
          );
        },
        { key: preset.key, basis },
      );
      const card = await page
        .locator('[data-ror-metric="revenue"]')
        .innerText();
      if (
        expected.revenue != null &&
        !card.includes(
          expected.revenue.toLocaleString("en-GB", {
            style: "currency",
            currency: "GBP",
          }),
        )
      )
        throw Error("KPI preset amount mismatch " + preset.key + " " + basis);
      const total = await page
        .locator('[data-ror-section="comparison"] tr')
        .filter({ hasText: "Total / weighted avg" })
        .innerText();
      if (
        expected.revenue != null &&
        !total.includes(
          expected.revenue.toLocaleString("en-GB", {
            style: "currency",
            currency: "GBP",
          }),
        )
      )
        throw Error("Comparison preset amount mismatch");
    }
  }
  for (const name of ["Page", "Sales comparison", "Sales explorer"])
    await page
      .getByLabel(name + " date range", { exact: true })
      .selectOption("previousFY");
  for (const metric of ["revenue", "orders", "aov", "units"]) {
    await page
      .getByLabel("Sales comparison metric", { exact: true })
      .selectOption(metric);
    await page
      .getByLabel("Sales explorer metric", { exact: true })
      .selectOption(metric);
  }
  for (const grain of [
    "daily",
    "weekly",
    "monthly",
    "quarterly",
    "financial-year",
    "calendar-year",
  ]) {
    await page
      .getByLabel("Sales comparison granularity", { exact: true })
      .selectOption(grain);
    await page
      .getByLabel("Sales explorer granularity", { exact: true })
      .selectOption(grain);
  }
  for (const comparison of ["none", "previous-period", "previous-year"])
    await page
      .getByLabel("Sales explorer comparison", { exact: true })
      .selectOption(comparison);
  for (const name of ["Bar", "Line", "Stacked bar", "Area"])
    await page
      .locator('[data-ror-section="explorer"]')
      .getByText(name, { exact: true })
      .click();
  await page
    .getByLabel("Page date range", { exact: true })
    .selectOption("custom");
  await page.getByLabel("Page start date", { exact: true }).fill("2023-01-01");
  await page.getByLabel("Page end date", { exact: true }).fill("2023-12-31");
  if (
    !(await page.locator('[data-ror-metric="revenue"]').innerText()).includes(
      "—",
    )
  )
    throw Error("Missing source fabricated");
  await page.getByLabel("Page start date", { exact: true }).fill("2026-02-10");
  await page.getByLabel("Page end date", { exact: true }).fill("2026-01-15");
  if (!(await page.locator("body").innerText()).includes("Start date"))
    throw Error("Invalid date accepted");
  await tab("Shopify Growth");
  await page.getByRole("button", { name: "FY27", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of tabs) {
    await tab(name);
    if (await overflow()) throw Error("P2 mobile overflow " + name);
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  // Fetch and integrity failures keep every original tab and never substitute stale finance.
  let failures = 0;
  for (const kind of ["fetch", "hash"]) {
    await page.route("**/finance/staging/manifest.json", async (route) => {
      if (kind === "fetch")
        await route.fulfill({ status: 503, body: "unavailable" });
      else {
        const response = await route.fetch(),
          data = await response.json();
        data.sha256 = "0".repeat(64);
        await route.fulfill({ json: data });
      }
    });
    await page.reload();
    await page.getByLabel("Shopify financial basis", { exact: true }).waitFor();
    await page.waitForTimeout(250);
    const body = await page.locator("body").innerText();
    if (!body.includes(kind === "fetch" ? "manifest unavailable" : "integrity"))
      throw Error("Source failure not shown");
    for (const name of tabs) await tab(name);
    await page.unroute("**/finance/staging/manifest.json");
    failures++;
  }
  await page.route("**/finance/staging/refresh-status.json",route=>route.fulfill({json:{status:"failed",error:"fixture import failure"}}));
  await page.reload();await page.getByLabel("Shopify financial basis",{exact:true}).waitFor();await page.waitForTimeout(250);
  if(!(await page.locator("body").innerText()).includes("Latest financial refresh failed"))throw Error("Growth refresh failure hidden");
  await tab("ROR Sales");await page.getByLabel("Page date range",{exact:true}).waitFor();if(!(await page.locator("body").innerText()).includes("Latest financial refresh failed"))throw Error("ROR refresh failure hidden");
  await page.unroute("**/finance/staging/refresh-status.json");
  await page.reload();
  await page.getByLabel("Shopify financial basis", { exact: true }).waitFor();
  if (errors.length) throw Error(errors.join("; "));
  return {
    yearlyBasisChecks,
    presetSelections: selections,
    originalGrowthTabs: 7,
    rorMetrics: 4,
    granularities: 6,
    explorerCharts: 4,
    mobileGrowthTabs: 7,
    pairedScreenshots: 22,
    sourceFailureChecks: failures,
    refreshFailureDashboards: 2,
    pageErrors: errors,
  };
}
