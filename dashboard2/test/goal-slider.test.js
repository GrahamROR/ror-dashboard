'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../goal-slider'),G=require('../goals'),T=require('../../growth/targets'),C=require('../calculations'),M=require('../data-model');
const range={startDate:'2026-08-01',endDate:'2026-11-09'};
function records(value=10,orders=1){
 const rows=[];
 for(let date=range.startDate;date<=range.endDate;date=C.addDays(date,1))for(const channel of M.ACTIVE_CHANNELS)rows.push({date,channel,revenue:value,orders,units:orders,completeness:'complete'});
 return rows;
}
test('Dragging the target reuses the shared plan, preserves actuals and reconciles seasonal pennies',()=>{
 const rows=records(),before=JSON.stringify(rows),approved=S.build(rows,range,'FY27',500000,M.ACTIVE_CHANNELS),dragged=S.build(rows,range,'FY27',755000,M.ACTIVE_CHANNELS);
 assert.deepEqual(dragged.months,G.build(rows,range,'FY27',755000,M.ACTIVE_CHANNELS).months);
 assert.equal(dragged.months.reduce((n,m)=>n+Math.round(m.fullTarget*100),0),75500000);
 assert.equal(dragged.actual,approved.actual);assert.equal(dragged.orders,approved.orders);
 assert.equal(dragged.ytdTarget,T.plan(755000,'FY27',range.endDate).ytdTarget);
 assert.equal(dragged.variance,T.variance(dragged.actual,dragged.ytdTarget));assert.equal(JSON.stringify(rows),before);
 assert.equal(dragged.monthlyAverage,755000/12);assert.equal(dragged.weeklyAverage,755000/52);assert.equal(dragged.dailyAverage,755000/365);
 assert.equal(dragged.salesPerOrder,10);assert.equal(dragged.ordersPerDay,dragged.dailyAverage/10);
});
test('Missing source coverage keeps hypothetical targets and withholds YTD, monthly variance and order pace',()=>{
 const rows=records().filter(r=>!(r.date==='2026-11-05'&&r.channel==='etsy')),p=S.build(rows,range,'FY27',750000,M.ACTIVE_CHANNELS);
 assert.equal(p.actual,null);assert.equal(p.orders,null);assert.equal(p.variance,null);assert.equal(p.ordersPerDay,null);
 assert.equal(p.months[3].revenue,null);assert.equal(p.months[3].variance,null);assert.equal(p.months[3].status,'pending');assert.ok(p.months[2].revenue>0);assert.ok(p.ytdTarget>0);
});
test('A source day missing from real marketplace finance cannot turn into a subtotal or a zero',()=>{
 const shop=require('../../finance/staging/'+require('../../finance/staging/manifest.json').file),markets=structuredClone(require('../../finance/marketplaces/staging/'+require('../../finance/marketplaces/staging/manifest.json').file));
 markets.channels.etsy.daily=markets.channels.etsy.daily.filter(d=>d.date!=='2026-11-05');const rows=[];rows.management={shop,markets,basis:'net_revenue'};
 const p=S.build(rows,range,'FY27',750000,M.ACTIVE_CHANNELS);assert.equal(p.actual,null);assert.equal(p.variance,null);assert.equal(p.months[3].revenue,null);assert.equal(p.ordersPerDay,null);
});
test('Genuine zero actuals remain zero; missing and zero denominators never become a fabricated order pace',()=>{
 const p=S.build(records(0,0),range,'FY27',500000,M.ACTIVE_CHANNELS);assert.equal(p.actual,0);assert.equal(p.orders,0);assert.equal(p.months[0].revenue,0);assert.equal(p.variance,-p.ytdTarget);assert.equal(p.salesPerOrder,null);assert.equal(p.ordersPerDay,null);
 const negative=S.build(records(-10,1),range,'FY27',500000,M.ACTIVE_CHANNELS);assert.ok(negative.actual<0);assert.ok(negative.months[0].revenue<0);assert.equal(negative.ordersPerDay,null);
});
test('MTD keeps the completed-day target, future months retain only a full target, and new-FY day one stays unavailable',()=>{
 const p=S.build(records(),range,'FY27',750000,M.ACTIVE_CHANNELS);assert.equal(p.months[3].elapsedDays,9);assert.equal(p.months[3].status,'mtd');assert.ok(p.months[3].expectedTarget<p.months[3].fullTarget);
 for(const m of p.months.slice(4)){assert.equal(m.future,true);assert.equal(m.actual,null);assert.equal(m.revenue,null);assert.equal(m.variance,null);assert.ok(m.fullTarget>0);}
 assert.equal(S.build(records(),{unsupported:true},'Current FY',750000,M.ACTIVE_CHANNELS),null);
 const leap=S.build([], {startDate:'2023-08-01',endDate:'2023-08-01'},'FY24',750000,M.ACTIVE_CHANNELS);assert.equal(leap.days,366);assert.equal(leap.dailyAverage,750000/366);
});

// Render the real new component for financial gap/zero/negative chart semantics.
function render(rows,r=range){
 const fs=require('node:fs'),vm=require('node:vm');
 const ctx=vm.createContext({window:{RorModel:M,RorGoalSlider:S},React:{Fragment:'fragment'},GrowthTargets:T,fmtC:v=>v==null?'—':String(v),useMemo:f=>f(),useState:v=>[v,()=>{}],el:(type,props,...children)=>({type,props:props||{},children})});
 vm.runInContext(fs.readFileSync(require.resolve('../goal-slider-app'),'utf8'),ctx);
 function expand(n){if(!n||typeof n!=='object')return n;if(Array.isArray(n))return n.map(expand);if(typeof n.type==='function'){ctx.useState=v=>[n.type.name==='GoalSliderCard'?true:v,()=>{}];return expand(n.type({...n.props,children:n.children}));}return {...n,children:n.children.map(expand)};}
 return expand({type:ctx.window.RorGoalSliderCard,props:{records:rows,range:r,fy:'FY27',target:500000},children:[]});
}
function nodes(tree){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...tree.children.flatMap(nodes)];}
test('Rendered missing/future actuals are gaps; targets, dates and source limitations remain explicit',()=>{
 const rows=records().filter(r=>!(r.date==='2026-11-05'&&r.channel==='etsy')),tree=render(rows),all=nodes(tree),nov=all.find(n=>n.props['data-slider-month']==='2026-11'),future=all.find(n=>n.props['data-slider-month']==='2026-12');
 for(const month of [nov,future]){assert.equal(nodes(month).filter(n=>n.props['data-slider-actual']).length,0);assert.equal(nodes(month).filter(n=>n.type==='rect').length,1);assert.ok(JSON.stringify(month).includes('—'));}
 const text=JSON.stringify(tree);assert.match(text,/coverage is incomplete/);assert.match(text,/09-11-2026/);assert.match(text,/not separately tuned to marketplace seasonality yet/);assert.doesNotMatch(text,/Sessions per day|Shopify AOV/);
 assert.equal(all.find(n=>n.props['data-slider-ytd']==='actual').children[0],'—');assert.equal(all.find(n=>n.props['data-slider-ytd']==='variance').children[0],'—');
});
test('Rendered genuine zero has a marker and negative actuals extend below zero without negative SVG dimensions',()=>{
 const zero=nodes(render(records(0,0)));assert.equal(zero.find(n=>n.props['data-slider-ytd']==='actual').children[0],'0');assert.ok(zero.some(n=>n.type==='line'&&n.props['data-slider-actual']==='2026-08'));
 const signed=nodes(render(records(-10,1))),bar=signed.find(n=>n.type==='rect'&&n.props['data-slider-actual']==='2026-08'),baseline=signed.find(n=>n.type==='line'&&!n.props['data-slider-actual']);assert.ok(bar.props.height>0);assert.equal(bar.props.y,baseline.props.y1);assert.ok(signed.filter(n=>n.type==='rect').every(n=>Number.isFinite(n.props.height)&&n.props.height>=0));
});
test('A partial source day with positive figures never supplies a verified YTD/order pace',()=>{
 const rows=records();rows.find(r=>r.date==='2026-11-05').completeness='partial';const p=S.build(rows,range,'FY27',500000,M.ACTIVE_CHANNELS);assert.equal(p.actual,null);assert.equal(p.ordersPerDay,null);assert.equal(p.months[3].status,'pending');
 const text=JSON.stringify(render(rows,{unsupported:true}));assert.match(text,/No completed reporting day/);assert.doesNotMatch(text,/Monthly All Stores what-if goal chart/);
});
