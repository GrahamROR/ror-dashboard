'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../calculations'),H=require('../../finance/historical/reporting'),M=require('../../finance/management');
const load=p=>JSON.parse(fs.readFileSync(p)),bundle=load('finance/historical/manifest.json');
const shop=load('finance/staging/'+load('finance/staging/manifest.json').file),markets=load('finance/marketplaces/staging/'+load('finance/marketplaces/staging/manifest.json').file);
const archive=load(bundle.marketplaces.file),legacy=load(bundle.shopify.file),channels=['shopify','etsy','noths'];
function records(a=archive,m=markets){const r=load('dashboard2/sales-data.json').records;r.management={shop,markets:m,basis:'net_revenue'};r.historicalContext=H.prepare({archive:a,legacy,shop,markets:m,through:'2026-11-09'});return r;}
function table(r,from='2025-08-01',to='2026-07-31',metric='revenue'){return C.buildComparisonTable(r,{channels,granularity:'monthly',fromPeriod:from,toPeriod:to,metric,nowDate:'2026-11-10',matchSelectedDates:true});}
test('FY26 live total is unchanged and every historical monthly YoY + first MoM baseline resolves',()=>{
 const r=records(),t=table(r);assert.equal(t.totals.revenue,398139.18);assert.equal(t.rows[0].mom.previous,28391.14);assert.equal(t.rows[0].yoy.previous,25815.34);
 assert.equal(t.rows.length,12);assert.ok(t.rows.every(row=>row.yoy.status==='ok'));assert.ok(t.rows.every(row=>row.mom.status==='ok'));
 for(const row of t.rows){assert.ok(row.yoy.previousConfidence.includes(H.HIST));assert.equal(row.current.revenue,C.aggregate(r,{channels,startDate:row.bucket.startDate,endDate:row.bucket.endDate}).revenue);}
});
test('Historical count and whole-range AOV comparisons use compatible source counts, not imported units',()=>{
 const r=records(),t=table(r,undefined,undefined,'orders');assert.ok(t.rows.every(row=>row.yoy.status==='ok'));
 const b=C.comparisonAggregate(r,{channels,startDate:'2024-08-01',endDate:'2025-07-31'});assert.equal(b.aov,b.revenue/b.orders);assert.equal(b.confidence,H.HIST);
});
test('Historical accessor preserves FY running VAT allocation and never mutates or promotes source rows',()=>{
 const a=structuredClone(archive),m=structuredClone(markets),before=JSON.stringify({a,m}),r=records(a,m),ctx=r.historicalContext;
 const whole=ctx.select(channels,'2024-08-01','2025-07-31');let cents=0;
 for(const bucket of C.bucketsForGranularity('monthly','2024-08-01','2025-07-31'))cents+=Math.round(ctx.select(channels,bucket.startDate,bucket.endDate).value*100);
 assert.equal(cents,Math.round(whole.value*100));assert.equal(JSON.stringify({a,m}),before);
 assert.equal(M.marketplace(a,'etsy','2024-08-01','2024-08-31','net_revenue').value,null);
});
test('Workbook-era monetary AND order baselines cannot masquerade as daily native Net Sales',()=>{
 const r=records(),p=C.comparisonAggregate(r,{channels:['shopify'],startDate:'2023-01-01',endDate:'2023-01-31'});
 assert.equal(p.revenue,null);assert.equal(p.orders,null);assert.equal(p.status,'incomplete-data');
 r.management.basis='gross_revenue';assert.equal(C.comparisonAggregate(r,{channels,startDate:'2024-01-01',endDate:'2024-01-31'}).revenue,null);
});
test('A single missing archive day blocks money and counts; no subtotal is promoted',()=>{
 const a=structuredClone(archive);a.channels.etsy.daily=a.channels.etsy.daily.filter(d=>d.date!=='2024-08-12');const t=table(records(a));
 assert.equal(t.rows[0].yoy.status,'incomplete-data');assert.equal(t.rows[0].yoy.previous,null);assert.equal(t.rows[1].yoy.status,'ok');
});
function daily(start,end){const r=[];for(let day=start;day<=end;day=C.addDays(day,1))r.push({date:day,channel:'shopify',revenue:day.startsWith('2025')?10:20,orders:1,units:1,completeness:'complete'});return r;}
const partialOpts={channels:['shopify'],granularity:'monthly',fromPeriod:'2026-10-11',toPeriod:'2026-11-09',metric:'revenue',nowDate:'2026-11-10',matchSelectedDates:true,comparison:'previous-year'};
test('Last30 selected slices compare matching calendar dates; unequal October/September lengths stay blocked',()=>{
 const r=daily('2025-01-01','2026-11-09'),t=C.buildComparisonTable(r,partialOpts),s=C.buildSeries(r,partialOpts);
 assert.deepEqual(t.rows.map(x=>[x.bucket.startDate,x.bucket.endDate]),[['2026-10-11','2026-10-31'],['2026-11-01','2026-11-09']]);
 assert.equal(t.rows[0].mom.status,'unequal-periods');assert.equal(t.rows[0].yoy.status,'ok');assert.equal(t.rows[0].yoy.previous,210);
 assert.equal(t.rows[1].mom.status,'ok');assert.deepEqual(t.rows[1].mom.previousRange,{startDate:'2026-10-01',endDate:'2026-10-09'});
 assert.deepEqual(s.comparisonSeries[0].points.map(p=>p.value),[210,90]);assert.equal(t.totals.revenue,600);
 // Default shared caller still cannot compare partial slices against whole months.
 assert.equal(C.buildComparisonTable(r,{...partialOpts,matchSelectedDates:false}).rows[0].yoy.percentChange,null);
});
test('Missing source day inside a matching partial range still blocks table AND chart comparisons',()=>{
 const r=daily('2025-01-01','2026-11-09').filter(x=>x.date!=='2025-11-05'),t=C.buildComparisonTable(r,partialOpts),s=C.buildSeries(r,partialOpts);
 assert.equal(t.rows[1].yoy.percentChange,null);assert.equal(s.comparisonSeries[0].points[1].value,null);
});
test('Leap day mismatch is explicit; zero prior money retains absolute change without percentage',()=>{
 const r=daily('2023-01-01','2024-02-29'),opts={...partialOpts,fromPeriod:'2024-02-20',toPeriod:'2024-02-29'},t=C.buildComparisonTable(r,opts);
 assert.equal(t.rows[0].yoy.status,'unequal-periods');
 for(const x of r)if(x.date>='2023-02-01'&&x.date<='2023-02-10')x.revenue=0;
 const z=C.buildComparisonTable(r,{...opts,fromPeriod:'2024-02-01',toPeriod:'2024-02-10'}).rows[0].yoy;assert.equal(z.status,'zero-denominator');assert.equal(z.percentChange,null);assert.ok(z.absoluteChange>0);
});
test('The next London day preserves yesterday despite a stale snapshot, never silently clipping the requested end',()=>{
 const r=records();for(const c of ['etsy','noths'])r.management.markets={...r.management.markets,channels:{...r.management.markets.channels,[c]:{...r.management.markets.channels[c],daily:r.management.markets.channels[c].daily.filter(d=>d.date<='2026-11-08')}}};
 const range=C.resolveDateRange('last30',{nowDate:new Date('2026-11-10T08:53:00Z'),availableEnd:'2026-11-08'});
 assert.equal(range.endDate,'2026-11-09');assert.equal(C.aggregate(r,{channels,...range}).revenue,null);assert.equal(range.outsideCoverage,true);
});

test('A selected 31st cannot silently shift to the 30th of a shorter target month',()=>{
 const r=daily('2025-01-01','2026-11-09');const t=C.buildComparisonTable(r,{...partialOpts,fromPeriod:'2026-10-31',toPeriod:'2026-10-31'});assert.equal(t.rows[0].mom.status,'unequal-periods');
});

test('An unavailable optional historical accessor cannot crash live reporting or invent a baseline',()=>{
 const r=records();r.historicalContext.select=()=>{throw Error('Unavailable module');};const t=table(r);assert.equal(t.rows[0].yoy.percentChange,null);assert.equal(t.totals.revenue,398139.18);
});
