'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../performance'),T=require('../targets'),Goals=require('../../finance/goals'),I=require('../../finance/integration'),F=require('../../finance/contract'),Collector=require('../../scripts/collect-performance');
const snapshot=require('../../finance/staging/'+require('../../finance/staging/manifest.json').file);
const through='2026-11-09';
function source(){const windows={};for(const r of P.ranges(through)){const n=I.report(snapshot,r.start,r.end,'net_revenue');windows[r.key]={start:r.start,end:r.end,status:'complete',revenue:n.totalSales,netSales:n.netSales,orders:n.orders,aov:51.23,sessions:100,convertedSessions:10,customers:20,returning:5,repeatRate:0.25,conversionRate:0.1,margin:0.4,profit:123,costCoverage:0.5};}return {schema:'shopify-performance-v1',timezone:'Europe/London',through,status:'complete',...windows};}
test('Every preset uses exactly its completed inclusive calendar-day range, including leap/DST boundaries',()=>{assert.deepEqual(P.ranges(through).map(r=>[r.key,r.start,r.end]),[['yesterday','2026-11-09',through],['last7','2026-11-03',through],['last30','2026-10-11',through],['last90','2026-08-12',through]]);assert.equal(P.ranges('2024-03-01')[1].start,'2024-02-24');assert.equal(P.ranges('2026-10-26')[1].start,'2026-10-20');});
test('Performance targets equal independent dailyTarget sums across month, leap and FY boundaries',()=>{
 for(const [start,end]of [['2026-07-20','2026-08-10'],['2024-02-20','2024-03-10'],['2026-10-11',through]]){
  let expected=0;for(let day=start;day<=end;day=F.next(day)){const month=+day.slice(5,7),fy='FY'+String(+day.slice(0,4)+(month>=8?1:0)).slice(-2),idx=(month+4)%12;expected+=T.allocate(Goals.annual(fy))[idx]/T.monthDays(day.slice(0,7));}
  const result=P.target(start,end,(day,idx,fy)=>T.allocate(Goals.annual(fy))[idx]/T.monthDays(day.slice(0,7)));assert.equal(result,Math.round(expected*100)/100);
 }
});
test('Native amounts remain selected-basis canonical; direct-window AOV is preserved, not computed from revenue/orders',()=>{
 const performance=source(),data={performance};for(const r of P.ranges(through))for(const basis of I.BASIS){const actual=P.view({data,snapshot,basis,key:r.key,through}),expected=I.report(snapshot,r.start,r.end,basis);assert.equal(actual.revenue,expected.revenue);assert.equal(actual.orders,expected.orders);assert.equal(actual.netRevenue,I.report(snapshot,r.start,r.end,'net_revenue').revenue);assert.equal(actual.aov,51.23);assert.equal(actual.windowVerified,true);assert.equal(actual.profit,123);}
});
test('A financial gap withholds amounts and unverified marketing/profit; a mismatched capture never substitutes for canonical totals',()=>{
 const performance=source(),hole={...snapshot,days:snapshot.days.filter(r=>r.day!=='2026-11-05')};const missing=P.view({data:{performance},snapshot:hole,basis:'net_revenue',key:'last7',through});assert.equal(missing.revenue,null);assert.equal(missing.profit,null);assert.equal(missing.sessions,null);
 performance.last7.orders++;const mismatch=P.view({data:{performance},snapshot,basis:'net_revenue',key:'last7',through});assert.equal(mismatch.revenue,I.report(snapshot,'2026-11-03',through,'net_revenue').revenue);assert.equal(mismatch.sessions,null);assert.equal(mismatch.windowVerified,false);
});
test('A stale or wrong-range capture is unavailable; original single-day legacy marketing is reused only for its exact date',()=>{
 const performance=source();performance.last30.start='2026-10-10';assert.equal(P.view({data:{performance},snapshot,basis:'net_revenue',key:'last30',through}).sessions,null);
 const legacy={date:through,sessions:42};assert.equal(P.view({data:{yesterday:legacy},snapshot,basis:'net_revenue',through}).sessions,42);assert.equal(P.view({data:{yesterday:legacy},snapshot,basis:'net_revenue',key:'last7',through}).sessions,null);assert.equal(P.view({data:{yesterday:{date:'2026-11-08',sessions:42}},snapshot,basis:'net_revenue',through}).sessions,null);
});
test('Collector makes one sales/session query for EACH exact window and derives ratios only from that direct aggregate',async()=>{
 const calls=[];const query=async q=>{calls.push(q);return q.startsWith('FROM sales')?[{total_sales:'1234.56',net_sales:'1000.00',orders:'20',average_order_value:'61.23',customers:'10',returning_customers:'3',cost_of_goods_sold:'200.00',gross_profit:'100.00'}]:[{sessions:'123',sessions_that_completed_checkout:'7',conversion_rate:'0.05691'}];};
 const p=await Collector.collect({query,through});assert.equal(calls.length,8);for(const r of P.ranges(through)){assert.equal(calls.filter(q=>q.endsWith(`SINCE ${r.start} UNTIL ${r.end}`)).length,2);assert.equal(p[r.key].aov,61.23);assert.equal(p[r.key].conversionRate,7/123);assert.equal(p[r.key].repeatRate,0.3);assert.equal(p[r.key].profit,333.33);}
});
test('Missing query rows/components fail instead of publishing invented zeros; zero sessions produce null ratios',async()=>{
 await assert.rejects(Collector.collect({query:async()=>[],through}),/source rows unavailable/);
 const q=async query=>query.startsWith('FROM sales')?[{total_sales:0,net_sales:0,orders:0,average_order_value:null,customers:0,returning_customers:0}]:[{sessions:0,sessions_that_completed_checkout:0,conversion_rate:null}];
 const p=await Collector.collect({query:q,through});assert.equal(p.last7.sessions,0);assert.equal(p.last7.conversionRate,null);assert.equal(p.last7.aov,null);assert.equal(p.last7.profit,null);
});

test('Boolean and whitespace source components never become known zero amounts',async()=>{
 for(const invalid of [false,true,' '])await assert.rejects(Collector.collect({through,query:async q=>q.startsWith('FROM sales')?[{total_sales:invalid,net_sales:0,orders:0,average_order_value:null,customers:0,returning_customers:0}]:[{sessions:0,sessions_that_completed_checkout:0}]}),/components unavailable/);
});

test('Legacy single-day fallback is disclosed as a populated original capture, distinct from unavailable windows',()=>{
 const data={yesterday:{date:through,sessions:42}};const fallback=P.view({data,snapshot,basis:'net_revenue',through}),missing=P.view({data,snapshot,basis:'net_revenue',through,key:'last7'});
 assert.equal(fallback.marketingAvailable,true);assert.equal(fallback.sessions,42);assert.match(fallback.warning,/original date-matched single-day capture/);assert.equal(missing.marketingAvailable,false);assert.match(missing.warning,/unavailable for this window/);assert.notEqual(fallback.warning,missing.warning);
});

test('Unvalidated Gross shipping withholds Gross money without suppressing independently Net-verified marketing or profit',()=>{
 const data={performance:source()},unvalidated=structuredClone(snapshot);for(const day of unvalidated.days)day.gross_shipping_validated=false;
 const result=P.view({data,snapshot:unvalidated,basis:'gross_revenue',through,key:'last7'});assert.equal(result.revenue,null);assert.equal(result.windowVerified,true);assert.equal(result.sessions,100);assert.equal(result.profit,123);
});
