# Release acceptance for 09-11-2026; requires Python Playwright. Run with local or live and an optional output directory.
import json,re,sys,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
mode=sys.argv[1] if len(sys.argv)>1 else 'local'
url='https://grahamror.github.io/ror-dashboard/' if mode=='live' else 'http://127.0.0.1:8780'
out=Path(sys.argv[2]) if len(sys.argv)>2 else Path(tempfile.mkdtemp(prefix='ror-history-browser-'));out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1000},locale='en-GB',timezone_id='Europe/London')
 page.clock.set_fixed_time('2026-11-09T20:00:00Z')
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url,wait_until='networkidle');page.get_by_text('ROR Sales',exact=True).click()
 revenue=page.locator('[data-ror-metric="revenue"]')
 page.wait_for_function("document.querySelector('[data-ror-metric=\"revenue\"]')?.innerText.includes('£398,139.18')")
 page.get_by_label('Page date range',exact=True).select_option('currentFY')
 page.wait_for_function("document.querySelector('[data-ror-metric=\"revenue\"]')?.innerText.includes('£79,554.92')")
 assert not page.locator('[data-historical-content]').count()
 page.get_by_text('Historical sales · Monthly archive',exact=True).click()
 year=page.get_by_label('Historical reporting year',exact=True);year.wait_for()
 assert year.input_value()=='2016'
 table=page.get_by_role('table',name='Historical monthly sales')
 assert table.locator('tbody tr').count()==12
 for row in table.locator('tbody tr').all():
  assert 'Workbook · recorded revenue' in row.locator('td').nth(1).inner_text()
  assert 'API history · Net Sales' in row.locator('td').nth(2).inner_text()
  assert 'API history · Net Sales' in row.locator('td').nth(3).inner_text()
  assert row.locator('td').nth(4).inner_text().strip()=='—'
 page.locator('[data-ror-section="history"]').screenshot(path=str(out/'history-2016-desktop.png'),animations='disabled')
 assert page.get_by_label('Page date range',exact=True).input_value()=='currentFY'
 assert '£79,554.92' in revenue.inner_text()
 year.select_option('2015')
 assert 'Partial source coverage' in table.inner_text()
 year.select_option('2024')
 assert all('—' not in r.locator('td').nth(4).inner_text() for r in table.locator('tbody tr').all())
 year.select_option('2026')
 november=page.locator('[data-history-month="2026-11"]')
 assert 'Through 08-11-2026' in november.inner_text()
 assert '—' not in november.locator('td').nth(4).inner_text()
 assert page.locator('[data-history-month="2026-12"]').locator('td').nth(4).inner_text().strip()=='—'
 year.select_option('2016')
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 page.locator('[data-ror-section="history"]').screenshot(path=str(out/'history-2016-mobile.png'),animations='disabled')
 alltext=page.locator('body').inner_text()
 assert not re.search(r'\b\d{4}-\d{2}-\d{2}\b',alltext)
 page.get_by_text('Shopify Growth',exact=True).click()
 for name in ['Overview','Yesterday','Monthly','Products','Email','Ads','Margin']:
  page.get_by_text(name,exact=True).first.click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),name
 assert not errors,errors
 # Corrupt only the archive response. The integrity guard must isolate it from live reporting.
 page.route('**/finance/marketplaces/historical/snapshots/*.json*',lambda r:r.fulfill(body='{}',content_type='application/json'))
 page.reload(wait_until='networkidle');page.get_by_text('ROR Sales',exact=True).click()
 page.get_by_label('Page date range',exact=True).select_option('currentFY')
 page.wait_for_function("document.querySelector('[data-ror-metric=\"revenue\"]')?.innerText.includes('£79,554.92')")
 page.get_by_text('Historical sales · Monthly archive',exact=True).click()
 page.get_by_text('Historical archive could not be loaded. Current reporting remains available.',exact=False).wait_for()
 assert not page.get_by_role('table',name='Historical monthly sales').count()
 assert '£79,554.92' in page.locator('[data-ror-metric="revenue"]').inner_text()
 page.unroute('**/finance/marketplaces/historical/snapshots/*.json*')
 page.get_by_role('button',name='Retry historical data',exact=True).click()
 page.get_by_label('Historical reporting year',exact=True).wait_for()
 assert not errors,errors
 result={'mode':mode,'year2016Rows':12,'workbookBasisKeptSeparate':True,'firstSourceMonthPartial':True,'mainCurrentFYNet':79554.92,'liveKPIsUnchanged':True,'native2024AllStoresChecked':True,'currentMonthCutoff':'08-11-2026','mobileOverflow':False,'yearFirstDates':False,'growthTabs':7,'corruptArchiveBlocked':True,'retryRecovered':True,'pageErrors':errors}
 (out/'results.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result))
 browser.close()
