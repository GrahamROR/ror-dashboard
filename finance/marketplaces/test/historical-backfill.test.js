'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const B=require('../historical-backfill'),A=require('../api-normalize'),S=require('../store'),Legacy=require('../../historical/legacy-shopify');
const penny=n=>({amount:n,divisor:100,currency_code:'GBP'}),gbp=n=>({cents:n,currency:{iso_code:'GBP',subunit_to_unit:100}});
const dates=['2015-12-30','2015-12-31','2016-01-01','2016-01-02'];
function capture(channel,start,end){
 const rows=dates.filter(d=>d>=start&&d<=end).map((d,i)=>channel==='etsy'?{receipt_id:dates.indexOf(d)+1,create_timestamp:Date.parse(d+'T12:00:00Z')/1000,status:'Completed',is_paid:true,refunds:[],total_price:penny(1200),discount_amt:penny(100),grandtotal:penny(1500),total_shipping_cost:penny(400),total_tax_cost:penny(0)}:{id:dates.indexOf(d)+1,placed_at:d+'T12:00:00Z',order_total:gbp(1500),financials:{purchase_items:{gross:gbp(1200)},purchase_delivery:{gross:gbp(400)},purchase_discount:{gross:gbp(100)}}});
 return {channel,start:A.midnight(start),end:A.midnight(require('../../contract').next(end)),count:rows.length,pages:1,collected_at:'2026-11-09T00:00:00Z',rows};
}
function fixture(){
 const repo=fs.mkdtempSync(path.join(os.tmpdir(),'historical-backfill-test-'));
 const live=path.join(repo,'finance/marketplaces/staging');
 S.publish(live,{schema:'marketplace-sales-v1',channels:{etsy:{daily:[{date:'2016-01-03'}]},noths:{daily:[{date:'2016-01-03'}]}}});
 const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.relative(live,path.join(p,e.name))+':'+crypto.createHash('sha256').update(fs.readFileSync(path.join(p,e.name))).digest('hex')]).sort();
 const baseline=()=>walk(live);
 let calls=0,clears=0;
 const readerFactory=()=>({clear(){clears++;},async capture({channel,start,end,initialOffset}){calls++;const raw=capture(channel,start,end);raw.rows[0].buyer_email='private-fixture@example.invalid';const result={capture:raw,derived:A.derive(raw,start,end),initial_offset:initialOffset,resume_offset:initialOffset+raw.rows.length,audit:{mapping_policy:'fixture',native_gbp_mapped_orders:0,page_response_sha256:['a'.repeat(64)]}};return result;}});
 const discovery=Object.fromEntries(['etsy','noths'].map(c=>[c,{earliest_day:dates[0],total_source_orders:4,probed_at:'2026-11-09T00:00:00Z',private_extra:'fixture-secret'}]));
 const options={repo,readerFactory,discovery,credentialsFn:async()=>({})};
 return {repo,live,baseline,options,get calls(){return calls;},get clears(){return clears;},clean:()=>fs.rmSync(repo,{recursive:true,force:true})};
}
test('Year and monthly checkpoint ranges join exactly at midnight across year end and leap February',()=>{
 assert.deepEqual(B.chunks('2015-12-30','2016-01-02').map(r=>[r.start,r.end]),[['2015-12-30','2015-12-31'],['2016-01-01','2016-01-02']]);
 assert.deepEqual(B.chunks('2024-02-01','2024-03-01','month').map(r=>r.end),['2024-02-29','2024-03-01']);
});
test('Multi-chunk history equals a single derivation, stays separate from live, and reruns without source reads',async()=>{
 const f=fixture();try{
  const before=f.baseline(),first=await B.run(f.options);assert.equal(f.calls,4);assert.deepEqual(f.baseline(),before);
  for(const c of ['etsy','noths']){const expected=A.derive(capture(c,dates[0],dates.at(-1)),dates[0],dates.at(-1));assert.deepEqual(first.archive.channels[c].daily,expected.daily.map(r=>({...r,completeness:B.CONFIDENCE})));}
  const second=await B.run({...f.options,readerFactory:()=>({capture:()=>{throw Error('Cached chunk must not read source');}})});
  assert.equal(second.publication.sha256,first.publication.sha256);assert.deepEqual(f.baseline(),before);
  assert.equal(fs.readdirSync(path.join(f.repo,'finance/marketplaces/historical/snapshots')).length,1);
  const text=JSON.stringify(first.archive);assert.doesNotMatch(text,/buyer_email|private-fixture|fixture-secret|receipt_id|access_token|"id"/);assert.equal(first.archive.validated,false);assert.equal(first.archive.confidence,B.CONFIDENCE);
 }finally{f.clean();}
});
test('A corrupted checkpoint or cursor chain cannot be silently reused',async()=>{
 const f=fixture();try{await B.run(f.options);const dir=path.join(f.repo,'finance/local-data/historical-backfill'),file=fs.readdirSync(dir).find(n=>n.startsWith('noths-'));const p=path.join(dir,file),data=JSON.parse(fs.readFileSync(p));data.initial_offset++;fs.writeFileSync(p,JSON.stringify(data));await assert.rejects(B.run(f.options),/checkpoint integrity or cursor/);}finally{f.clean();}
});
test('Protected live output and symlink aliases are rejected before any write',()=>{
 const f=fixture();try{assert.throws(()=>B.paths({repo:f.repo,out:f.live}),/cannot write live/);assert.throws(()=>B.paths({repo:f.repo,cache:f.live}),/cannot write live/);const alias=path.join(f.repo,'history-alias');fs.symlinkSync(f.live,alias);assert.throws(()=>B.paths({repo:f.repo,out:alias}),/cannot write live/);assert.throws(()=>B.paths({repo:f.repo,cache:path.join(f.repo,'public-cache')}),/private and ignored/);}finally{f.clean();}
});
test('A later source failure retains the last archive pointer and every live file',async()=>{
 const f=fixture();try{await B.run(f.options);const pointer=path.join(f.repo,'finance/marketplaces/historical/manifest.json'),before=fs.readFileSync(pointer),live=f.baseline();await assert.rejects(B.run({...f.options,force:true,readerFactory:()=>({clear(){},capture:async()=>{throw Error('Unusable native financial component');}})}));assert.deepEqual(fs.readFileSync(pointer),before);assert.deepEqual(f.baseline(),live);}finally{f.clean();}
});
test('Changing global source counts is retried with cleared transport state, without bypassing validation',async()=>{
 const f=fixture();let reads=0,clears=0;try{
  const original=f.options.readerFactory;
  await B.run({...f.options,readerFactory:()=>{const r=original();return{clear(){clears++;},async capture(opts){if(reads++===0)throw Error('Native source count changed during collection');return r.capture(opts);}};}});
  assert.equal(clears,1);assert.equal(reads,5);
 }finally{f.clean();}
});
test('Shopify workbook export publishes only monthly aggregate fields and never a partially overlapping live month',()=>{
 const input={records:[{period:'2015-12',channel:'shopify',revenue:100.01,orders:3,buyer_email:'private@example.invalid',cell:'Z99'},{period:'2016-01',channel:'shopify',revenue:222,orders:5},{period:'2015-12',channel:'noths',revenue:999,orders:10}]};
 const result=Legacy.derive(input,'2016-01-03');assert.deepEqual(result.months,[{period:'2015-12',revenue:100.01,orders:3}]);assert.equal(result.grain,'monthly');assert.equal(result.confidence,'self-reported');assert.equal(result.basis,'workbook-recorded-revenue');
 assert.doesNotMatch(JSON.stringify(result),/private@|buyer_email|Z99|noths|222/);
 assert.deepEqual(Object.keys(result.months[0]).sort(),['orders','period','revenue']);
 assert.throws(()=>Legacy.derive({records:[...input.records,input.records[0]]},'2016-01-03'),/duplicated/);
});

test('Native order identity duplicated across chunks blocks archive publication', async()=>{
 const f=fixture();try{const base=f.options.readerFactory;await assert.rejects(B.run({...f.options,readerFactory:()=>{const reader=base();return{clear(){},async capture(opts){const r=await reader.capture(opts);if(opts.channel==='etsy'&&opts.start==='2016-01-01')r.capture.rows[0].receipt_id=1;return r;}};}}),/duplicated across historical chunks/);assert.equal(fs.existsSync(path.join(f.repo,'finance/marketplaces/historical/manifest.json')),false);}finally{f.clean();}
});

test('Legacy aggregate export rejects a historical-folder symlink into live finance before reading private input',()=>{
 const f=fixture();try{fs.symlinkSync(f.live,path.join(f.repo,'finance/historical'));assert.throws(()=>Legacy.importPrivate({repo:f.repo}),/cannot write live/);}finally{f.clean();}
});
