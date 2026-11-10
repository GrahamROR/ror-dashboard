'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const G=require('../goals'),C=require('../calculations'),T=require('../../growth/targets'),M=require('../data-model');
const shop=require('../../finance/staging/'+require('../../finance/staging/manifest.json').file),markets=require('../../finance/marketplaces/staging/'+require('../../finance/marketplaces/staging/manifest.json').file);
const range=C.resolveDateRange('currentFY',{nowDate:new Date('2026-11-10T12:00:00Z')});
function records(m=markets){const r=[];r.management={shop,markets:m,basis:'net_revenue'};return r;}
test('ROR monthly goal actuals match direct gated aggregates, reconcile YTD, and preserve annual pennies',()=>{
 const r=records(),report=G.build(r,range,'FY27',500000,M.ACTIVE_CHANNELS);assert.equal(report.months.length,12);
 for(const month of report.months){if(month.future){assert.equal(month.actual,null);assert.equal(month.variance,null);}else{const actual=C.aggregate(r,{channels:M.ACTIVE_CHANNELS,startDate:month.startDate,endDate:month.endDate});assert.equal(month.revenue,actual.revenue);assert.equal(month.orders,actual.orders);}}
 assert.equal(report.months.reduce((n,m)=>n+Math.round(m.fullTarget*100),0),50000000);
 assert.equal(report.months.filter(m=>!m.future).reduce((n,m)=>n+Math.round(m.revenue*100),0),Math.round(C.aggregate(r,{channels:M.ACTIVE_CHANNELS,...range}).revenue*100));
 assert.equal(report.months[3].elapsedDays,9);assert.equal(report.months[3].status,'mtd');
});
test('One absent marketplace source day withholds monthly actual/variance without changing the cutoff or substituting a subtotal',()=>{
 const m=structuredClone(markets);m.channels.etsy.daily=m.channels.etsy.daily.filter(d=>d.date!=='2026-11-05');const r=records(m),report=G.build(r,range,'FY27',500000,M.ACTIVE_CHANNELS);
 assert.equal(report.plan.cutoff,'2026-11-09');assert.equal(report.months[3].endDate,'2026-11-09');assert.equal(report.months[3].revenue,null);assert.equal(report.months[3].variance,null);assert.equal(report.months[3].status,'pending');assert.ok(report.months[2].revenue>0);
});
test('Seasonal disclosure and current-FY date bounds appear in the rendered goals table',()=>{
 const r=records(),ctx=vm.createContext({window:{RorGoalPlan:G},RorModel:M,RorCalc:C,GrowthRunRate:require('../../growth/run-rate'),GrowthTargets:T,FinancialGoals:require('../../finance/goals'),React:{},el:(type,props,...children)=>({type,props,children}),fmt:String,fmtC:String,fmtP:String});
 vm.runInContext(fs.readFileSync(require.resolve('../ror-sales-app'),'utf8'),ctx);
 const tree=ctx.window.RorMonthlyGoalsContent({records:r,range,fy:'FY27',target:500000,actual:C.aggregate(r,{channels:M.ACTIVE_CHANNELS,...range})});
 const rendered=JSON.stringify(tree);assert.match(rendered,/existing Shopify seasonal shape/);assert.match(rendered,/not separately tuned to marketplace seasonality yet/);assert.match(rendered,/09-11-2026/);assert.match(rendered,/9\/30 verified days/);assert.match(rendered,/YTD Total/);
 const hole=structuredClone(markets);hole.channels.noths.daily.pop();const missing=JSON.stringify(ctx.window.RorMonthlyGoalsContent({records:records(hole),range,fy:'FY27',target:500000}));assert.match(missing,/source coverage unavailable/);assert.doesNotMatch(missing,/9\/30 verified days/);
});
test('First day of a new FY has no fabricated reporting day or actual',()=>{assert.equal(G.build(records(),{unsupported:true},'Current FY',500000,M.ACTIVE_CHANNELS),null);const p=T.plan(500000,'FY28','2027-07-31');assert.ok(p.months.every(m=>m.elapsedDays===0));});
