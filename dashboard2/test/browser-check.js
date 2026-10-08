// Run with Playwright's browser_run_code against the local static server.
async (page) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.continue()); // Disable cache during the local code review.
  await page.goto('http://127.0.0.1:8766');
  await page.getByText('ROR Sales', { exact:true }).click();
  const names = ['Page', 'Sales comparison', 'Sales explorer'];
  const expected = await page.evaluate(() => RorCalc.REPORT_DATE_PRESETS.map(p => ({value:p.key,label:p.label})));
  let selections = 0;
  for (const name of names) {
    const control = page.getByRole('combobox', {name:name + ' date range',exact:true});
    await control.waitFor();
    const options = await control.locator('option').evaluateAll(nodes => nodes.map(n => ({value:n.value,label:n.textContent})));
    if (JSON.stringify(options) !== JSON.stringify(expected)) throw Error(name + ' presets differ');
    for (const option of expected) {
      await control.selectOption(option.value);
      if (option.value === 'custom') {
        await page.getByLabel(name + ' start date',{exact:true}).fill('2024-02-01');
        await page.getByLabel(name + ' end date',{exact:true}).fill('2024-02-29');
      }
      const section = name === 'Page' ? 'KPI cards' : name === 'Sales comparison' ? 'Sales comparison (independent dates; page store filter)' : 'Sales explorer (independent dates and stores)';
      const text = await page.locator('[data-report-period]').filter({hasText:section + ':'}).innerText();
      const range = await page.evaluate(key => RorCalc.resolveDateRange(key,{customStart:'2024-02-01',customEnd:'2024-02-29'}),option.value);
      if (!text.includes(range.startDate + ' → ' + range.endDate)) throw Error(name + ' dates incorrect for ' + option.value);
      selections++;
    }
  }
  await page.getByRole('combobox',{name:'Page date range',exact:true}).selectOption('previousFY');
  if (await page.getByRole('combobox',{name:'Sales comparison date range',exact:true}).inputValue() !== 'custom') throw Error('Table dates coupled to page dates');
  if (await page.getByRole('combobox',{name:'Sales explorer date range',exact:true}).inputValue() !== 'custom') throw Error('Explorer dates coupled to page dates');
  for (const name of names) await page.getByRole('combobox',{name:name + ' date range',exact:true}).selectOption('previousFY');
  await page.getByText('Financial basis: imported gross line sales · Pending reconciliation',{exact:true}).click();
  await page.screenshot({path:'docs/pr1/screenshots/after-fy26.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  for (const name of names) await page.getByRole('combobox',{name:name + ' date range',exact:true}).selectOption('custom');
  const overflow = await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  if (overflow.scroll > overflow.width + 1) throw Error('Mobile overflow: ' + JSON.stringify(overflow));
  await page.screenshot({path:'docs/pr1/screenshots/after-mobile.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1280,height:900});
  await page.getByText('Shopify Growth',{exact:true}).click();
  for (const name of ['Overview','Yesterday','Monthly','Products','Email','Ads','Margin']) {
    await page.getByText(name,{exact:true}).first().click();
    if (!(await page.locator('body').innerText()).includes('Shopify total sales')) throw Error('Missing financial basis on ' + name);
  }
  await page.getByText('Email',{exact:true}).first().click();
  if (!(await page.locator('body').innerText()).includes('Klaviyo-attributed conversion value')) throw Error('Email attribution basis missing');
  await page.getByText('Ads',{exact:true}).first().click();
  if (!(await page.locator('body').innerText()).includes('Ads period:')) throw Error('Ads coverage warning missing');
  await page.screenshot({path:'docs/pr1/screenshots/after-ads.png',fullPage:true,animations:'disabled'});
  await page.getByText('ROR Sales',{exact:true}).click();
  await page.getByRole('combobox',{name:'Page date range',exact:true}).waitFor();
  await page.screenshot({path:'docs/pr1/screenshots/after-current.png',fullPage:true,animations:'disabled'});
  if (errors.length) throw Error(errors.join('\n'));
  return {presetSelections:selections,independentDates:true,mobileOverflow:false,growthTabs:7,pageErrors:errors};
}
