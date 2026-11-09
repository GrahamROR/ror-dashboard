'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../collect');
const money=cents=>({cents,currency:{iso_code:'GBP',subunit_to_unit:100}});
const component={gross:money(1200),net:money(1000),vat:money(200)};
function order(id,placed_at){return {id,placed_at,state:'accepted',order_total:money(1200),delivery_total:money(0),refund_total:money(0),items:[{listing_total_gross:money(1200)}],financials:{purchase_discount:component,commission:component,listing_total_with_discount:component}};}
const days=['2015-12-31','2016-01-01','2016-01-02','2016-01-03','2016-01-04','2016-01-05'];
function fixture(dir){const rows=days.map((d,i)=>order(i+1,d+'T12:00:00Z'));if(dir==='desc')rows.reverse();const calls=[];return {calls,fetcher:async(url,options)=>{const u=new URL(url);calls.push({url:u,options});const offset=Number(u.searchParams.get('offset'));if(calls.length>2)throw Error('Unexpected page after target boundary');return {ok:true,json:async()=>({query:{total:134185},data:rows.slice(offset,offset+3)})};}};}
const scope={channel:'noths',start:'2016-01-01T00:00:00Z',end:'2016-01-04T00:00:00Z',env:{NOTHS_TOKEN:'synthetic-fixture'},maxPages:3};
test('Ascending NOTHS collection skips older rows and stops at the exclusive end without paging newer history',async()=>{
 const f=fixture('asc'),r=await C.collect({...scope,dir:'asc',fetcher:f.fetcher});
 assert.equal(f.calls.length,2);assert.equal(r.count,3);assert.deepEqual(r.rows.map(x=>x.placed_at),days.slice(1,4).map(d=>d+'T12:00:00Z'));
 for(const c of f.calls){assert.equal(c.url.searchParams.get('dir'),'asc');assert.equal(c.url.searchParams.get('sort'),'placed_at');assert.equal(c.options.method,'GET');}
});
test('Default live NOTHS direction remains descending, with the same request, early stop and output as explicit desc',async()=>{
 const a=fixture('desc'),b=fixture('desc'),implicit=await C.collect({...scope,fetcher:a.fetcher}),explicit=await C.collect({...scope,dir:'desc',fetcher:b.fetcher});
 delete implicit.collected_at;delete explicit.collected_at;assert.deepEqual(implicit,explicit);assert.equal(a.calls.length,2);assert.equal(implicit.rows.length,3);assert.deepEqual(a.calls.map(c=>String(c.url)),b.calls.map(c=>String(c.url)));assert.equal(a.calls[0].url.searchParams.get('dir'),'desc');
});
test('Both directions reject provider order reversal before any partial capture is returned',async()=>{
 for(const dir of ['asc','desc'])await assert.rejects(C.collect({...scope,dir,fetcher:async()=>({ok:true,json:async()=>({query:{total:3},data:[order(1,'2016-01-02T12:00:00Z'),order(2,dir==='asc'?'2016-01-01T12:00:00Z':'2016-01-03T12:00:00Z')]})})}),/sorting changed/);
});
test('Direction validation fails before any source request and empty captures remain complete',async()=>{
 await assert.rejects(C.collect({...scope,dir:'sideways',fetcher:()=>{throw Error('No request permitted');}}),/sort direction/);
 for(const dir of ['asc','desc']){const r=await C.collect({...scope,dir,fetcher:async()=>({ok:true,json:async()=>({query:{total:0},data:[]})})});assert.equal(r.count,0);assert.equal(r.pages,1);}
});
test('Ascending stop includes exact start midnight, excludes exact end midnight and never sanitizes later rows',async()=>{
 const r=await C.collect({...scope,dir:'asc',fetcher:async()=>({ok:true,json:async()=>({query:{total:134185},data:[order(1,scope.start),{id:2,placed_at:scope.end},{id:3,placed_at:'2017-01-01T00:00:00Z'}]})})});
 assert.equal(r.rows.length,1);assert.equal(r.rows[0].placed_at,scope.start);assert.equal(r.pages,1);
});
test('Page bounds still fail closed when the requested historical scope has not been exhausted',async()=>{
 await assert.rejects(C.collect({...scope,dir:'asc',maxPages:1,fetcher:async()=>({ok:true,json:async()=>({query:{total:134185},data:[order(1,scope.start)]})})}),/collection incomplete/);
});
