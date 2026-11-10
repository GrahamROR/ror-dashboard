import json,re,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
mode=sys.argv[1] if len(sys.argv)>1 else 'local';out=Path(sys.argv[2]) if len(sys.argv)>2 else Path('/private/tmp/ror-comparison-coverage-browser-'+mode);out.mkdir(exist_ok=True)
url='https://grahamror.github.io/ror-dashboard/?v=comparison-coverage-v2' if mode=='live' else 'http://127.0.0.1:8780/'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,channel='chrome');page=b.new_page(viewport={'width':1500,'height':1050},locale='en-GB',timezone_id='Europe/London');errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(url,wait_until='networkidle');page.get_by_label('Shopify financial year',exact=True).wait_for();page.get_by_text('ROR Sales',exact=True).click();date=page.get_by_label('Page date range',exact=True);date.wait_for();page.wait_for_function("Array.from(document.querySelector('[aria-label=\"Page date range\"]').options).some(o=>o.value==='FY17')")
 results={'mode':mode,'clock':page.evaluate('new Date().toISOString()'),'ranges':{}}
 try:
  for preset in ['year2026YTD','last30','thisMonth','currentFY']:
   date.select_option(preset);card=page.locator('[data-ror-metric="revenue"]');page.wait_for_timeout(150);text=card.inner_text();assert '£' in text,(preset,text);assert 'Incomplete coverage' not in text,(preset,text);results['ranges'][preset]=text
  date.select_option('last30');comparison=page.locator('[data-ror-section="comparison"]');comparison.get_by_label('Sales comparison date range',exact=True).select_option('previousFY');rows=comparison.locator('tbody tr').filter(has_not_text='Total / weighted avg');assert rows.count()==12;texts=rows.all_text_contents();assert all('Incomplete comparison' not in t for t in texts),texts;assert all('£' in row.locator('td').nth(5).inner_text() for row in rows.all());assert '£398,139.18' in comparison.inner_text();assert 'historical API data' in comparison.inner_text();results['FY26']=texts
  comparison.get_by_label('Sales comparison date range',exact=True).select_option('last30');texts=comparison.locator('tbody tr').all_text_contents();assert 'Different day counts' in texts[0],texts;assert 'Incomplete comparison' not in ''.join(texts),texts;assert 'selected dates' in ''.join(texts);results['last30Comparison']=texts
  comparison.get_by_label('Sales comparison date range',exact=True).select_option('last12Months');texts=comparison.locator('tbody tr').all_text_contents();assert 'Incomplete comparison' not in ''.join(texts),texts;assert 'missing source coverage' not in ''.join(texts);results['last12Comparison']=texts
  comparison.get_by_label('Sales comparison date range',exact=True).select_option('previousFY');page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(out/'current-sales-and-comparisons.png'),full_page=True,animations='disabled')
  explorer=page.locator('[data-ror-section="explorer"]');explorer.get_by_label('Sales explorer comparison',exact=True).select_option('previous-year');assert explorer.locator('svg path[stroke-dasharray="5,4"]').count()>0;assert 'historical API data' in explorer.inner_text();results['nativeExplorerHistoricalOverlay']=True
  # Existing historical presentation remains available.
  date.select_option('FY17');history=page.locator('[data-history-report="Page"]');history.get_by_role('table').wait_for();assert history.locator('tbody tr').count()==12;date.select_option('last30');page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(out/'current-sales-mobile.png'),full_page=True,animations='disabled')
  assert not re.search(r'\b\d{4}-\d{2}-\d{2}\b',page.locator('body').inner_text());assert not errors,errors;results['pageErrors']=errors;results['mobileOverflow']=False
 except Exception:
  (out/'failure.txt').write_text(page.locator('body').inner_text());page.screenshot(path=str(out/'failure.png'),full_page=True);raise
 (out/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results));b.close()
