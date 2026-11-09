'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../../historical/reporting'),M=require('../../management'),F=require('../../contract');
const shop=require('../../staging/'+require('../../staging/manifest.json').file);
function rows(c,start,end,completeness){const out=[];for(let date=start;date<=end;date=F.next(date))out.push({date,orders:1,...(c==='etsy'?{net_sales:101,shipping:1}:{customer_total:101}),completeness});return out;}
function fixture(){
 const channels=Object.fromEntries(['etsy','noths'].map(c=>[c,{coverage:{start:'2023-12-01',end:'2024-01-15'},daily:rows(c,'2023-12-01','2024-01-15',H.HIST)}]));
 const live={channels:Object.fromEntries(['etsy','noths'].map(c=>[c,{daily:rows(c,'2024-01-16','2024-01-31','validated')}]))};
 const legacy={schema:'shopify-legacy-monthly-v1',source:'spreadsheet-import',confidence:'self-reported',basis:'workbook-recorded-revenue',grain:'monthly',currency:'GBP',coverage:{start:'2023-12',end:'2023-12'},months:[{period:'2023-12',revenue:123.45,orders:7}]};
 return {archive:{schema:'marketplace-sales-v1',historical:true,validated:false,confidence:H.HIST,currency:'GBP',timezone:'Europe/London',channels},legacy,shop,markets:live,through:'2024-01-31'};
}
test('Archive/live mid-month split reproduces existing management maths with a distinct historical confidence',()=>{
 const f=fixture(),ctx=H.prepare(f),result=ctx.month('2024-01');
 const certified={channels:Object.fromEntries(['etsy','noths'].map(c=>[c,{daily:[...f.archive.channels[c].daily,...f.markets.channels[c].daily].map(r=>({...r,completeness:'validated'}))}]))};
 const expected=M.select(shop,certified,['shopify','etsy','noths'],'2024-01-01','2024-01-31','net_revenue');
 assert.equal(result.all.value,expected.value/100);assert.equal(result.all.confidence,H.HIST);assert.equal(result.all.status,'complete');
 assert.equal(result.etsy.value,26.35);assert.equal(result.noths.value,26.09);
});
test('Workbook revenue stays as recorded, monthly only, and cannot create a combined Net Sales total',()=>{
 const f=fixture(),result=H.prepare(f).month('2023-12');
 assert.equal(result.shopify.value,123.45);assert.equal(result.shopify.confidence,'self-reported');assert.equal(result.shopify.basis,'workbook-recorded-revenue');
 assert.equal(result.etsy.status,'complete');assert.equal(result.noths.status,'complete');assert.equal(result.all.value,null);assert.match(result.all.reason,/no confirmed Net Sales basis/);
 assert.equal(f.legacy.months[0].date,undefined);
});
test('Overlap, duplicated days and a history row pretending to be live-validated are rejected',()=>{
 for(const defect of ['overlap','duplicate','pretend']){
  const f=fixture();
  if(defect==='overlap')f.archive.channels.etsy.daily.push({...f.markets.channels.etsy.daily[0],completeness:H.HIST});
  if(defect==='duplicate')f.archive.channels.etsy.daily.splice(1,0,f.archive.channels.etsy.daily[0]);
  if(defect==='pretend')f.archive.channels.etsy.daily[0].completeness='validated';
  assert.throws(()=>H.prepare(f),/overlap|duplicate|Invalid/);
 }
});
test('A missing source day remains an explicit recorded subtotal and cannot appear as a complete All Stores figure',()=>{
 const f=fixture();f.archive.channels.etsy.daily=f.archive.channels.etsy.daily.filter(r=>r.date!=='2024-01-10');
 const result=H.prepare(f).month('2024-01');assert.equal(result.etsy.status,'partial-source');assert.equal(result.etsy.missing_days,1);assert.equal(result.all.value,null);
});
test('Known zero, absent source and future months remain distinct',()=>{
 const f=fixture();for(const list of [f.archive.channels.etsy.daily,f.markets.channels.etsy.daily])for(const row of list){row.net_sales=0;row.shipping=0;row.orders=0;}
 const ctx=H.prepare(f);assert.equal(ctx.month('2024-01').etsy.value,0);assert.equal(ctx.month('2024-01').etsy.orders,0);assert.equal(ctx.month('2023-11').etsy.value,null);assert.equal(ctx.month('2024-02').all.value,null);
});
test('A monthly workbook row overlapping even one native Shopify day is rejected',()=>{
 const f=fixture();f.legacy.months.push({period:shop.coverage.start.slice(0,7),revenue:100,orders:2});assert.throws(()=>H.prepare(f),/overlap/);
});

test('The unchanged live management gate continues to withhold historical-labelled days',()=>{
 const f=fixture(),native=M.marketplace(f.archive,'noths','2023-12-01','2023-12-31','net_revenue');assert.equal(native.value,null);assert.equal(native.confidence,'unavailable');const historical=H.prepare(f).month('2023-12');assert.equal(historical.noths.confidence,H.HIST);assert.ok(historical.noths.value>0);
});

test('A missing native Shopify order count cannot produce a complete combined history figure',()=>{
 const f=fixture();f.shop=structuredClone(f.shop);f.shop.days.find(d=>d.day==='2024-01-10').orders=null;const row=H.prepare(f).month('2024-01');assert.equal(row.all.value,null);
});

test('Selected historical dates clip native daily amounts exactly without prorating workbook months',()=>{
 const f=fixture(),ctx=H.prepare(f);
 const row=ctx.month('2023-12',{startDate:'2023-12-15',endDate:'2023-12-31'});
 assert.equal(row.shopify.value,null);assert.match(row.shopify.reason,/full months only/);
 assert.equal(row.etsy.orders,17);assert.equal(row.noths.orders,17);assert.equal(row.partial_period,true);assert.equal(row.all.value,null);
 const native=ctx.month('2024-01',{startDate:'2024-01-10',endDate:'2024-01-20'});
 const certified={channels:Object.fromEntries(['etsy','noths'].map(c=>[c,{daily:[...f.archive.channels[c].daily,...f.markets.channels[c].daily].map(r=>({...r,completeness:'validated'}))}]))};
 assert.equal(native.all.value,M.select(shop,certified,['shopify','etsy','noths'],'2024-01-10','2024-01-20','net_revenue').value/100);
 assert.equal(native.etsy.orders,11);assert.equal(native.start,'2024-01-10');assert.equal(native.end,'2024-01-20');
});
test('Fiscal selectors derive years from actual source depth, and historical routing is per selected store',()=>{
 assert.deepEqual(H.fiscalYears('2016-01-01','2026-11-08'),['FY27','FY26','FY25','FY24','FY23','FY22','FY21','FY20','FY19','FY18','FY17','FY16']);
 const C=require('../../../dashboard2/calculations'),fy16=C.resolveDateRange('FY16');assert.equal(fy16.startDate,'2015-08-01');assert.equal(fy16.endDate,'2016-07-31');assert.equal(C.REPORT_DATE_PRESETS.length,11);assert.equal(C.resolveDateRange('FY1').unsupported,true);
 const ctx={boundaries:{shopify:'2024-01-01',etsy:'2025-08-01',noths:'2025-08-01'}},r={startDate:'2024-01-01',endDate:'2024-12-31'};
 assert.equal(H.needsHistory(ctx,r,['shopify']),false);assert.equal(H.needsHistory(ctx,r,['etsy']),true);
 assert.equal(H.needsHistory(ctx,{startDate:'2023-08-01'},['shopify']),true);
 assert.equal(H.needsHistory(ctx,{startDate:'2025-08-01'},['etsy','noths']),false);
});
test('Historical range rows preserve selected edges and show no invented future or unsupported centuries',()=>{
 const ctx=H.prepare(fixture());
 const list=H.rangeRows(ctx,{startDate:'2023-12-15',endDate:'2024-01-20'});
 assert.deepEqual(list.map(r=>r.period),['2023-12','2024-01']);assert.equal(list[0].start,'2023-12-15');assert.equal(list[1].end,'2024-01-20');
 assert.deepEqual(H.rangeRows(ctx,{startDate:'2025-01-01',endDate:'2025-12-31'}),[]);
 const bounded=H.rangeRows(ctx,{startDate:'2000-01-01',endDate:'2030-12-31'});assert.equal(bounded.length,2);
 assert.throws(()=>H.rangeRows(ctx,{startDate:'2024-01-20',endDate:'2023-12-15'}),/Invalid selected/);
});
