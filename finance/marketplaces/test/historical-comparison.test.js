'use strict';
const test=require('node:test'),a=require('node:assert/strict'),A=require('../../historical/comparison');
const part=(value,orders=10,basis='workbook-recorded-revenue',extra={})=>({value,orders,basis,status:'complete',...extra});
test('Workbook comparisons describe changes in recorded fields with exact pence and the existing percent formula',()=>{
 const r=A.compareParts(part(123.46),part(100.01),{channel:'shopify'});a.equal(r.absoluteChange,23.45);a.ok(Math.abs(r.percentChange-(12346/10001-1)*100)<1e-10);a.equal(r.basis,'workbook-recorded-revenue');
 const n=A.compareParts(part(123,15),part(100,10),{channel:'shopify',metric:'orders'});a.equal(n.absoluteChange,5);a.equal(n.percentChange,50);
});
test('Shopify workbook/native boundary blocks both revenue and order-count comparisons',()=>{
 for(const metric of ['revenue','orders']){const r=A.compareParts(part(123,12,'net_revenue'),part(100,10),{channel:'shopify',metric});a.equal(r.status,'incompatible-basis');a.equal(r.absoluteChange,null);a.equal(r.percentChange,null);}
});
test('Marketplace history and live figures compare on the same preserved native policy',()=>{
 for(const channel of ['etsy','noths']){const r=A.compareParts(part(120,12,'net_revenue',{confidence:'provisional'}),part(100,10,'net_revenue',{confidence:'historical-api-backfill'}),{channel});a.equal(r.absoluteChange,20);a.ok(Math.abs(r.percentChange-20)<1e-10);}
});
test('Missing, partial and unknown-basis figures cannot become comparison values',()=>{
 for(const p of [null,part(null),part(100,10,'net_revenue',{status:'partial-source'}),part(100,10,'unknown')]){const r=A.compareParts(part(120,12,'net_revenue'),p,{channel:'etsy'});a.equal(r.percentChange,null);a.equal(r.absoluteChange,null);}
 a.equal(A.compareParts(part(100,null),part(100,10),{channel:'shopify',metric:'orders'}).percentChange,null);
});
test('Known zero has an absolute change without a misleading percent; zero current remains real data',()=>{
 const z=A.compareParts(part(20),part(0),{channel:'shopify'});a.equal(z.status,'zero-denominator');a.equal(z.absoluteChange,20);a.equal(z.percentChange,null);
 const r=A.compareParts(part(0),part(20),{channel:'shopify'});a.equal(r.absoluteChange,-20);a.equal(r.percentChange,-100);
});
test('Monthly comparison uses calendar months across years and rejects partial calendar selections',()=>{
 const seen=[],ctx={month:p=>{seen.push(p);return {partial_period:false,shopify:part(100)};}};
 const row={period:'2024-02',partial_period:false,shopify:part(120)};
 a.equal(A.monthComparison(ctx,row,'shopify').previous_period,'2023-02');a.equal(A.monthComparison(ctx,row,'shopify','previous-period').previous_period,'2024-01');
 a.equal(A.shiftMonth('2024-01',-1),'2023-12');a.equal(A.monthComparison(ctx,{...row,partial_period:true},'shopify').absoluteChange,null);a.equal(A.monthComparison(ctx,{...row,partial_period:true},'shopify').previous_period,'2023-02');a.equal(seen.length,2);
});

test('Both source confidence labels survive comparison and fractional / unsafe order counts are rejected',()=>{
 const r=A.compareParts(part(120,12,'net_revenue',{confidence:'provisional'}),part(100,10,'net_revenue',{confidence:'historical-api-backfill'}),{channel:'noths'});a.equal(r.currentConfidence,'provisional');a.equal(r.previousConfidence,'historical-api-backfill');
 for(const orders of [1.5,-1,Number.MAX_SAFE_INTEGER+1])a.equal(A.compareParts(part(100,orders),part(100,10),{channel:'shopify',metric:'orders'}).absoluteChange,null);
 a.equal(A.compareParts(part(100,10,'net_revenue',{confidence:'self-reported'}),part(100,10,'net_revenue'),{channel:'shopify'}).absoluteChange,null);
});

const H=require('../../historical/reporting');
function fakeContext(values,{start='2016-01-01',through='2024-12-31'}={}){
 return {earliest:start,through,boundaries:{shopify:'2024-01-01'},month:(period,range={})=>{const first=period+'-01',last=H.monthEnd(period),startDate=[first,range.startDate||first].sort().at(-1),endDate=[last,range.endDate||last,through].sort()[0];return {period,start:startDate,end:endDate,partial_period:startDate!==first||endDate!==last,shopify:values[period]||{status:'unavailable',value:null,orders:null},etsy:values[period]||{status:'unavailable',value:null,orders:null},all:{status:'unavailable',value:null,orders:null}};}};
}
test('Complete recorded periods total in pence and compare only against the complete matching period',()=>{
 const ctx=fakeContext({'2017-01':part(30.01,3),'2017-02':part(40.02,4),'2016-01':part(10.01,1),'2016-02':part(20.02,2)}),r=A.analyse(ctx,{startDate:'2017-01-01',endDate:'2017-02-28'},['shopify']);
 a.equal(r.summaries.shopify.part.value,70.03);a.equal(r.summaries.shopify.part.orders,7);a.equal(r.summaries.shopify.comparisons.revenue.absoluteChange,40);a.equal(r.summaries.shopify.comparisons.orders.absoluteChange,4);
});
test('A missing month yields a labelled subtotal, never a complete total or annual growth',()=>{
 const ctx=fakeContext({'2017-01':part(30,3),'2016-01':part(10,1),'2016-02':part(20,2)}),r=A.analyse(ctx,{startDate:'2017-01-01',endDate:'2017-02-28'},['shopify']);
 a.equal(r.summaries.shopify.groups[0].subtotal,30);a.equal(r.summaries.shopify.groups[0].knownMonths,1);a.equal(r.summaries.shopify.groups[0].expectedMonths,2);a.equal(r.summaries.shopify.part.value,null);a.equal(r.summaries.shopify.comparisons.revenue.absoluteChange,null);a.equal(r.series[0].points[1].value,null);
});
test('Mixed Shopify periods split their source subtotals and never yield a blended total or cross-basis order growth',()=>{
 const ctx=fakeContext({'2023-12':part(100,10),'2024-01':part(200,20,'net_revenue')}),r=A.analyse(ctx,{startDate:'2023-12-01',endDate:'2024-01-31'},['shopify'],'previous-period');
 a.equal(r.summaries.shopify.mixed,true);a.deepEqual(r.summaries.shopify.groups.map(g=>g.subtotal),[100,200]);a.equal(r.summaries.shopify.part.value,null);a.equal(r.summaries.shopify.part.orders,null);a.equal(r.summaries.shopify.comparisons.orders.absoluteChange,null);a.equal(r.rows[1].comparisons.shopify.status,'incompatible-basis');a.equal(r.series[0].points[1].value,null);a.equal(r.series[1].points[0].value,null);
});
test('An omitted source-leading month cannot be mistaken for full fiscal coverage',()=>{
 const ctx=fakeContext({'2016-01':part(100,10)}),r=A.analyse(ctx,{startDate:'2015-12-01',endDate:'2016-01-31'},['shopify']);
 a.equal(r.rows.length,1);a.equal(r.summaries.shopify.spanComplete,false);a.equal(r.summaries.shopify.part.value,null);a.equal(r.summaries.shopify.groups[0].expectedMonths,2);
});
test('Full-period previous comparison shifts by selected calendar-month count; partial selections never get growth',()=>{
 const ctx=fakeContext({'2017-03':part(30),'2017-04':part(40),'2017-01':part(10),'2017-02':part(20)}),r=A.analyse(ctx,{startDate:'2017-03-01',endDate:'2017-04-30'},['shopify'],'previous-period');
 a.deepEqual(r.previousRange,{startDate:'2017-01-01',endDate:'2017-02-28'});a.equal(r.summaries.shopify.comparisons.revenue.absoluteChange,40);
 const partial=A.analyse(ctx,{startDate:'2017-03-15',endDate:'2017-04-20'},['shopify']);a.equal(partial.summaries.shopify.comparisons.revenue.absoluteChange,null);a.ok(partial.series[0].points.every(p=>p.value===null));
});

test('Whole-period comparisons retain each historical/live confidence on both sides',()=>{
 const hist='historical-api-backfill',live='provisional',ctx=fakeContext({'2017-01':part(120,12,'net_revenue',{confidence:hist}),'2017-02':part(140,14,'net_revenue',{confidence:live}),'2016-01':part(100,10,'net_revenue',{confidence:hist}),'2016-02':part(110,11,'net_revenue',{confidence:hist})});
 const r=A.analyse(ctx,{startDate:'2017-01-01',endDate:'2017-02-28'},['etsy']);a.deepEqual(r.summaries.etsy.comparisons.revenue.currentConfidence,[hist,live]);a.deepEqual(r.summaries.etsy.comparisons.revenue.previousConfidence,[hist]);a.equal(r.summaries.etsy.comparisons.revenue.absoluteChange,50);
});
test('Known zero remains a complete period, while negative money is retained and flagged for truthful chart fallback',()=>{
 const zero=A.analyse(fakeContext({'2017-01':part(0,0)}),{startDate:'2017-01-01',endDate:'2017-01-31'},['shopify']);a.equal(zero.summaries.shopify.part.value,0);a.equal(zero.summaries.shopify.part.orders,0);a.equal(zero.series[0].points[0].value,0);
 const neg=A.analyse(fakeContext({'2024-01':part(-10,1,'net_revenue')}),{startDate:'2024-01-01',endDate:'2024-01-31'},['shopify']);a.equal(neg.summaries.shopify.part.value,-10);a.equal(neg.series[0].points[0].value,-10);a.equal(neg.negativeChartValues,true);
});

test('A subset of stores never displays an All Stores total containing an unselected channel',()=>{
 const ctx=fakeContext({'2017-01':part(100,10,'net_revenue')}),month=ctx.month;ctx.month=(period,range)=>({...month(period,range),noths:part(200,20,'net_revenue'),all:part(999,99,'net_revenue')});
 const r=A.analyse(ctx,{startDate:'2017-01-01',endDate:'2017-01-31'},['etsy','noths']);a.equal(r.showCombined,false);a.equal(r.summaries.all,undefined);a.equal(r.series.length,2);
});

test('Known full-month workbook order counts remain independently comparable when revenue is absent',()=>{
 const previous=part(null,10,'workbook-recorded-revenue',{status:'unavailable',confidence:'self-reported'}),current=part(120,12,'workbook-recorded-revenue',{confidence:'self-reported'});
 a.equal(A.compareParts(current,previous,{channel:'shopify',metric:'revenue'}).absoluteChange,null);a.equal(A.compareParts(current,previous,{channel:'shopify',metric:'orders'}).absoluteChange,2);
 const ctx=fakeContext({'2017-01':current,'2017-02':part(null,14,'workbook-recorded-revenue',{status:'unavailable',confidence:'self-reported'}),'2016-01':part(100,10),'2016-02':part(110,11)}),r=A.analyse(ctx,{startDate:'2017-01-01',endDate:'2017-02-28'},['shopify'],'previous-year','orders');
 a.equal(r.summaries.shopify.part.value,null);a.equal(r.summaries.shopify.part.orders,26);a.equal(r.summaries.shopify.comparisons.orders.absoluteChange,5);a.equal(r.summaries.shopify.comparisons.revenue.absoluteChange,null);a.equal(r.series[0].points[1].value,14);
 const incomplete={...previous,status:'partial-source',missing_days:1};a.equal(A.compareParts(current,incomplete,{channel:'shopify',metric:'orders'}).absoluteChange,null);
});
