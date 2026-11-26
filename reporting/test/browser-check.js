// Execute with Playwright browser_run_code against the local server on 8775.
// Optional unchanged-page reference server on 8776 enables exact Commercial DOM comparison.
// Uses only browser state and synthetic faults; no files, accounts or source data are written.
async (page) => {
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push(r.url()));
  await page.route('**/*', route => route.continue()); // Disable cached baseline HTML.
  const assert = (value, message) => { if (!value) throw Error(message); };
  const tab = name => page.getByRole('tab', { name, exact: true }).click();
  const rangeValue = selector => page.locator(selector).inputValue();
  const setRange = (selector, value) => page.locator(selector).evaluate((node, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, String(next));
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  const custom = async (start, end) => {
    await page.getByLabel('Report date range', { exact: true }).selectOption('custom');
    await page.getByLabel('Report start date', { exact: true }).fill(start);
    await page.getByLabel('Report end date', { exact: true }).fill(end);
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:8775/');
  await page.getByLabel('Shopify financial basis', { exact: true }).waitFor();
  assert(await page.getByRole('tab', { name: 'Commercial', exact: true }).getAttribute('aria-selected') === 'true', 'Commercial must be the default');
  assert(await page.getByLabel('Report date range', { exact: true }).count() === 0, 'New reports must be lazy mounted');
  const originalRoot = page.locator('#report-commercial > div');
  await originalRoot.evaluate(n => { n.__reportingRetentionMarker = 'original'; });

  await page.getByLabel('Shopify financial year', { exact: true }).selectOption('FY26');
  await page.getByLabel('Shopify financial basis', { exact: true }).selectOption('total_sales');
  await page.getByTitle('Unlock — allow dragging', { exact: true }).click();
  await setRange('input[type="range"][min="150000"]', 550000);
  await setRange('input[type="range"][min="0.005"]', .035);
  await setRange('input[type="range"][min="20"]', 48.5);
  const values = async () => ({
    fy: await page.getByLabel('Shopify financial year', { exact: true }).inputValue(),
    basis: await page.getByLabel('Shopify financial basis', { exact: true }).inputValue(),
    goal: await rangeValue('input[type="range"][min="150000"]'),
    cvr: await rangeValue('input[type="range"][min="0.005"]'),
    aov: await rangeValue('input[type="range"][min="20"]'),
  });
  const before = await values();
  assert(before.goal === '550000' && before.aov === '48.5', 'Original inputs did not respond');
  const beforeHtml = await originalRoot.innerHTML();
  await tab('Financial');
  await custom('2026-10-01', '2026-10-31');
  let arithmetic = await page.getByRole('table', { name: 'Management sales arithmetic', exact: true }).innerText();
  assert(arithmetic.includes('£16,243.79') && arithmetic.includes('464') && arithmetic.includes('£0.85'), 'October Shopify exact ratio/rounding mismatch');
  await tab('Native Analytics');
  assert((await page.getByRole('table', { name: 'Native source measures', exact: true }).innerText()).includes('£32.53'), 'Native AOV lost');
  await page.waitForFunction(() => document.querySelector('#report-additional').innerText.includes('22,071'));
  await tab('Metric Comparison');
  assert((await page.getByLabel('Report start date', { exact: true }).inputValue()) === '2026-10-01', 'New-report dates reset');
  await tab('Commercial');
  assert(JSON.stringify(await values()) === JSON.stringify(before), 'Original Growth state changed');
  assert(await originalRoot.evaluate(n => n.__reportingRetentionMarker === 'original'), 'Commercial was remounted');
  assert(await originalRoot.innerHTML() === beforeHtml, 'Original Commercial markup changed during report navigation');

  // Exercise keyboard navigation and restoration after hiding a tall Commercial page.
  await page.evaluate(() => { window.scrollTo(0, 400); document.getElementById('report-tab-financial').click(); });
  await page.waitForFunction(() => window.scrollY === 0);
  await tab('Commercial');
  await page.waitForFunction(() => Math.abs(window.scrollY - 400) < 2);
  await page.getByRole('tab', { name: 'Commercial', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  assert(await page.getByRole('tab', { name: 'Financial', exact: true }).evaluate(n => n === document.activeElement && n.getAttribute('aria-selected') === 'true'), 'Keyboard tab focus failed');
  await tab('Commercial');

  // All seven existing Growth tabs remain usable.
  for (const name of ['Overview', 'Performance', 'Monthly', 'Products', 'Email', 'Ads', 'Margin']) {
    await page.getByText(name, { exact: true }).first().click();
    assert((await originalRoot.innerText()).includes('£48'), 'Original target missing on ' + name);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['Commercial', 'Financial', 'Native Analytics', 'Metric Comparison']) {
    await tab(name);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Growth mobile overflow ' + name);
  }
  await tab('Commercial');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByText('ROR Sales', { exact: true }).click();
  await page.getByLabel('Page date range', { exact: true }).waitFor();
  await page.getByLabel('Page store', { exact: true }).selectOption('etsy');
  await page.getByLabel('Page date range', { exact: true }).selectOption('lastMonth');
  await page.getByLabel('Sales comparison date range', { exact: true }).selectOption('custom');
  await page.getByLabel('Sales comparison start date', { exact: true }).fill('2026-09-01');
  await page.getByLabel('Sales comparison end date', { exact: true }).fill('2026-09-30');
  await page.getByLabel('Sales explorer date range', { exact: true }).selectOption('last7');
  await page.getByLabel('Sales explorer metric', { exact: true }).selectOption('orders');
  await page.locator('[data-ror-section="explorer"]').getByText('Line', { exact: true }).click();
  const rorBefore = await page.locator('#report-commercial > div').innerHTML();
  await page.locator('#report-commercial > div').evaluate(n => { n.__reportingRetentionMarker = 'ror'; });
  await tab('Financial');
  assert(await page.getByLabel('Report store', { exact: true }).inputValue() === 'all', 'ROR report scope must default to All Stores');
  await custom('2026-10-01', '2026-10-31');
  arithmetic = await page.getByRole('table', { name: 'Management sales arithmetic', exact: true }).innerText();
  for (const value of ['£16,243.79', '£1,754.36', '£4,980.66', '£22,978.81', '719']) assert(arithmetic.includes(value), 'ROR source mismatch ' + value);
  assert((await page.locator('[data-report-statuses]').innerText()).includes('Provisional'), 'Combined source status overstated');
  for (const name of ['Native Analytics', 'Metric Comparison', 'Financial']) await tab(name);
  await tab('Commercial');
  assert(await page.locator('#report-commercial > div').evaluate(n => n.__reportingRetentionMarker === 'ror'), 'ROR was remounted');
  assert(await page.locator('#report-commercial > div').innerHTML() === rorBefore, 'Original ROR state/markup changed');

  // Preserve chart variants, independent controls and both responsive layouts.
  for (const name of ['Bar', 'Line', 'Stacked bar', 'Area']) await page.locator('[data-ror-section="explorer"]').getByText(name, { exact: true }).click();
  await page.getByLabel('Sales explorer metric', { exact: true }).selectOption('revenue');
  await page.getByLabel('Sales explorer series', { exact: true }).selectOption('byChannel');
  await page.locator('[data-ror-section="explorer"]').getByText('Donut', { exact: true }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ['Commercial', 'Financial', 'Native Analytics', 'Metric Comparison']) {
      await tab(name);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal page overflow ' + name + ' at ' + width);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await tab('Financial');
  const presets = await page.getByLabel('Report date range', { exact: true }).locator('option').evaluateAll(nodes => nodes.map(n => n.value));
  for (const preset of presets.filter(p => p !== 'custom')) await page.getByLabel('Report date range', { exact: true }).selectOption(preset);
  await custom('2029-01-01', '2029-01-31');
  assert((await page.locator('#report-additional').innerText()).includes('Complete matching source coverage is unavailable'), 'Future coverage fabricated');
  await custom('2026-10-20', '2026-10-01');
  assert((await page.locator('#report-additional').innerText()).includes('Start date'), 'Invalid custom dates accepted');

  // React child-render failure stays inside the new region; Commercial survives.
  await custom('2026-10-01', '2026-10-31');
  await page.evaluate(() => { window.__originalReportingBuild = RorReportingMetrics.build; RorReportingMetrics.build = () => { throw Error('Synthetic report rendering fault'); }; });
  await page.getByLabel('Report date range', { exact: true }).selectOption('last7');
  await page.getByRole('button', { name: 'Retry report', exact: true }).waitFor();
  await tab('Commercial');
  assert(await page.locator('#report-commercial > div').evaluate(n => n.__reportingRetentionMarker === 'ror'), 'Render error damaged Commercial');
  await page.evaluate(() => { RorReportingMetrics.build = window.__originalReportingBuild; });
  await tab('Financial');
  await page.getByRole('button', { name: 'Retry report', exact: true }).click();
  await page.getByLabel('Report date range', { exact: true }).waitFor();
  assert(errors.every(message => message.includes('Synthetic report rendering fault')), 'Unexpected page errors: ' + errors.join('; '));

  // Independent auxiliary fetch failure does not remove financial reporting.
  await page.route('**/data.json', route => route.fulfill({ status: 503, body: 'Synthetic capture failure' }));
  await page.reload();
  await page.getByLabel('Shopify financial basis', { exact: true }).waitFor();
  await tab('Native Analytics');
  await page.getByRole('button', { name: 'Retry Shopify capture', exact: true }).waitFor();
  await tab('Financial');
  await page.getByRole('table', { name: 'Management sales arithmetic', exact: true }).waitFor();
  await page.unroute('**/data.json');
  assert(requests.every(url => !/xero|anthropic/i.test(url)), 'Unexpected external accounting/model request');
  return { growthTabs: 7, newViews: 4, viewports: [1440, 390], newPresets: presets.length,
    originalGrowthStateRetained: true, originalRorStateRetained: true, exactCommercialMarkupRetained: true,
    renderFailureIsolated: true, auxiliaryFetchFailureIsolated: true, privateAccountingRequests: 0,
    unexpectedPageErrors: errors.filter(message => !message.includes('Synthetic report rendering fault')) };
}
