'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Collector=require('../../scripts/collect-performance'),I=require('../../finance/integration');
const code=fs.readFileSync(require.resolve('../../scripts/fetch-data'),'utf8');
function harness(now='2026-11-10T09:00:00Z',fail=false){
 const calls=[],written=[],past={fyLabel:'Untouched history',monthly:[{key:'2025-08',sessions:7}],summary:{anything:1}};
 const existing={currentFY:'FY27',yesterday:{sentinel:'old'},years:{FY26:past}};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return Date.parse(now);}}
 const field={total_sales:'1234.56',net_sales:'1000.00',orders:'20',average_order_value:'61.23',customers:'10',returning_customers:'3',cost_of_goods_sold:'200.00',gross_profit:'100.00'};
 const fetch=async(url,options)=>{
  if(url.includes('/oauth/'))return {ok:true,json:async()=>({access_token:'test-not-a-real-credential',expires_in:3600})};
  const q=JSON.parse(options.body).variables.query;calls.push(q);let rows;
  if(fail&&q.includes('SINCE 2026-10-11 UNTIL 2026-11-09'))throw Error('source failure');
  if(q.includes('product_title'))rows=[];
  else if(q.includes('GROUP BY month')){const start=/SINCE (\d{4}-\d{2})/.exec(q)[1],end=/UNTIL (\d{4}-\d{2})/.exec(q)[1];rows=[];for(let key=start;key<=end;){rows.push(q.startsWith('FROM sales')?{month:key,...field}:{month:key,sessions:'123',sessions_that_completed_checkout:'7',conversion_rate:'0.05691'});const d=new Date(key+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);key=d.toISOString().slice(0,7);}}
  else rows=q.startsWith('FROM sales')?[field]:[{sessions:'123',sessions_that_completed_checkout:'7',conversion_rate:'0.05691'}];
  return {ok:true,json:async()=>({data:{shopifyqlQuery:{tableData:{rows},parseErrors:[]}}})};
 };
 const module={exports:{}},ctx=vm.createContext({module,console:{log:()=>{},warn:()=>{}},process:{env:{SHOPIFY_STORE:'fixture',SHOPIFY_CLIENT_ID:'test',SHOPIFY_CLIENT_SECRET:'test'},argv:[]},__dirname:path.dirname(require.resolve('../../scripts/fetch-data')),Date:Clock,Intl,fetch,require:name=>name==='fs'?{existsSync:()=>true,readFileSync:()=>JSON.stringify(existing),writeFileSync:(file,bytes)=>written.push(JSON.parse(bytes))}:name==='./collect-performance'?Collector:require(name)});
 // Relative contract import resolves explicitly; source has no side effects when required.
 const baseRequire=ctx.require;ctx.require=name=>name==='../finance/contract'?require('../../finance/contract'):baseRequire(name);
 vm.runInContext(code,ctx);return {api:module.exports,calls,written,past};
}
test('Export adds complete direct-window aggregates while preserving original yesterday and past-year blocks',async()=>{
 const h=harness(),expected=await h.api.fetchYesterdaySales('test','2026-11-09');await h.api.main();assert.equal(h.written.length,1);const output=h.written[0];assert.deepEqual(output.yesterday,JSON.parse(JSON.stringify(expected)));assert.deepEqual(output.years.FY26,h.past);assert.deepEqual(output.marketingCoverage,{status:'complete',timezone:'Europe/London',start:'2026-08-01',end:'2026-11-09'});assert.equal(output.performance.last90.status,'complete');assert.ok(h.calls.filter(q=>q.includes('GROUP BY month')).every(q=>q.includes('UNTIL 2026-11-09')));
});
test('A failed added window leaves the previous export untouched instead of publishing partial data',async()=>{const h=harness(undefined,true);await assert.rejects(h.api.main(),/source failure/);assert.equal(h.written.length,0);});
test('First-of-month completed-day fetch omits the new month without breaking native future/MTD classification',async()=>{
 const h=harness('2026-11-01T09:00:00Z');await h.api.main();const output=h.written[0];assert.equal(output.marketingCoverage.end,'2026-10-31');const snapshot=require('../../finance/staging/'+require('../../finance/staging/manifest.json').file);const view=I.growthView({...output.years.FY27,fy:'FY27'},snapshot,'net_revenue',new Date('2026-11-01T09:00:00Z'));const november=view.monthly.find(m=>m.key==='2026-11');assert.equal(november.future,true);assert.equal(november.mtd,false);assert.equal(november.revenue,null);
});
test('New FY day one has no reversed monthly query or fabricated current-FY session history',async()=>{
 const h=harness('2026-08-01T09:00:00Z');await h.api.main();assert.equal(h.calls.filter(q=>q.includes('GROUP BY month')).length,0);assert.equal(h.written[0].marketingCoverage.status,'no-completed-days');assert.equal(h.written[0].years.FY27.summary.ytdSessions,null);assert.equal(h.written[0].performance.last7.end,'2026-07-31');
});
test('The source calendar uses London at BST midnight even when the runner is in UTC',()=>{const h=harness('2026-07-31T23:30:00Z');assert.equal(h.api.getYesterday(),'2026-07-31');assert.equal(h.api.computeFiscalYear(new Date('2026-07-31T23:30:00Z')).FY_KEY,'FY27');assert.equal(h.api.getCurrentMonthKey(),'2026-08');});
