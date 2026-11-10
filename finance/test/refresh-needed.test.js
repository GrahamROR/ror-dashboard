'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{needed}=require('../../scripts/finance-refresh-needed');
function fixture(completed='2026-11-10T01:00:00Z',end='2026-11-09'){
 return {'finance/staging/refresh-status.json':{status:'success',completed_at:completed},'finance/staging/manifest.json':{file:'snapshots/test.json'},'finance/staging/snapshots/test.json':{coverage:{end}},'data.json':{updated:completed,marketingCoverage:{end},performance:{status:'complete',through:end,...Object.fromEntries(['yesterday','last7','last30','last90'].map(k=>[k,{status:'complete',end}]))}},'finance/marketplaces/staging/refresh-status.json':{status:'success',completed_at:completed,source_covered_through:{etsy:end,noths:end}},'dashboard2/sales-data.json':{meta:{generated_at:completed,latest:end}}};
}
function options(data,now='2026-11-10T08:53:00Z'){return {read:file=>{if(!(file in data))throw Error('missing');return data[file];},now:new Date(now)};}
test('Recovery checks skip only today’s successful sources covering yesterday',()=>{
 for(const kind of ['shopify','marketplaces','units']){
  assert.equal(needed(kind,options(fixture())),false);assert.equal(needed(kind,options(fixture('2026-11-09T12:00:00Z','2026-11-08'))),true);assert.equal(needed(kind,options(fixture('2026-11-10T01:00:00Z','2026-11-08'))),true);assert.equal(needed(kind,options({})),true);
 }
});
test('Failed finance validation or one lagging marketplace cannot suppress retries',()=>{
 let data=fixture();data['finance/staging/refresh-status.json'].status='failed';assert.equal(needed('shopify',options(data)),true);
 data=fixture();data['finance/marketplaces/staging/refresh-status.json'].source_covered_through.etsy='2026-11-08';assert.equal(needed('marketplaces',options(data)),true);
});
test('London midnight and both DST boundaries use the London calendar, never elapsed 24-hour subtraction',()=>{
 for(const [now,today,end]of [['2026-07-01T23:30:00Z','2026-07-01T23:10:00Z','2026-07-01'],['2026-03-29T23:30:00Z','2026-03-29T23:10:00Z','2026-03-29'],['2026-10-25T00:30:00Z','2026-10-25T00:10:00Z','2026-10-24']])for(const kind of ['shopify','marketplaces','units'])assert.equal(needed(kind,options(fixture(today,end),now)),false);
});

test('Missing or failed Performance windows keep the Shopify recovery job eligible',()=>{
 for(const defect of ['missing','failed']){const data=fixture();if(defect==='missing')delete data['data.json'].performance;else data['data.json'].performance.last90.status='failed';assert.equal(needed('shopify',options(data)),true);}
});
