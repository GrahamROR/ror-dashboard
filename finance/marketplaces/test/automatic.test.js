'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const A=require('../api-normalize'),R=require('../automatic-refresh'),S=require('../store'),Source=require('../api-source'),P=require('../publication');
const cp=require('node:child_process');
const money=amount=>({amount,divisor:100,currency_code:'GBP'}),noths=cents=>({cents,currency:{iso_code:'GBP',subunit_to_unit:100}});
function etsy(overrides={}) {return {receipt_id:1,create_timestamp:Date.parse('2026-09-01T12:00:00Z')/1000,status:'Completed',is_paid:true,total_price:money(1000),discount_amt:money(200),grandtotal:money(930),total_shipping_cost:money(100),total_tax_cost:money(30),total_vat_cost:money(0),refunds:[],...overrides};}
function native(channel,rows) {return {channel,start:A.midnight('2026-09-01'),end:A.midnight('2026-09-03'),count:rows.length,pages:1,collected_at:'2026-09-03T05:00:00Z',rows};}
function order() {return {id:1,placed_at:'2026-09-01T12:00:00+01:00',order_total:noths(1100),refund_total:noths(300),financials:{purchase_items:{gross:noths(1000)},purchase_delivery:{gross:noths(200)},purchase_discount:{gross:noths(100)}}};}
test('London completed-day bounds cover both DST transitions without dropping an hour',()=>{
  assert.equal(A.midnight('2026-03-29'),'2026-03-29T00:00:00.000Z');
  assert.equal(A.midnight('2026-03-30'),'2026-03-29T23:00:00.000Z');
  assert.equal(A.midnight('2026-10-25'),'2026-10-24T23:00:00.000Z');
  assert.equal(A.midnight('2026-10-26'),'2026-10-26T00:00:00.000Z');
});
test('Etsy preserves paid unshipped sales and partial-refund policy; excludes cancelled fully refunded orders',()=>{
  const rows=[etsy({status:'Paid'}),etsy({receipt_id:2,status:'Partially Refunded',refunds:[{amount:money(100)}]}),etsy({receipt_id:3,status:'Canceled',refunds:[{amount:money(930)}]}),etsy({receipt_id:4,is_paid:false,status:'Open'})];
  const r=A.derive(native('etsy',rows),'2026-09-01','2026-09-02');
  assert.equal(r.daily[0].net_sales,1600);assert.equal(r.daily[0].orders,2);assert.equal(r.daily[0].tax,60);assert.equal(r.daily[1].orders,0);assert.equal(r.audit.excluded_orders,2);assert.equal(r.audit.partial_refunds,1);
  assert.match(r.tax_definition,/native|Native/);
});
test('NOTHS retains original customer totals and cohort counts without deducting cumulative refunds',()=>{
  const r=A.derive(native('noths',[order()]),'2026-09-01','2026-09-02');
  assert.equal(r.daily[0].customer_total,1100);assert.equal(r.daily[0].gross_sales,1000);assert.equal(r.daily[0].shipping,200);assert.equal(r.daily[0].orders,1);
});
test('Duplicate, incomplete, wrong-currency, unknown-eligibility and missing component captures cannot validate',()=>{
  const captures=[native('etsy',[etsy(),etsy()]),{...native('etsy',[etsy()]),count:2},native('etsy',[etsy({total_price:{...money(1000),currency_code:'USD'}})]),native('etsy',[etsy({status:'Unknown'})]),native('etsy',[etsy({total_shipping_cost:undefined})]),native('etsy',[etsy({status:'Canceled'})])];
  for(const capture of captures)assert.throws(()=>A.derive(capture,'2026-09-01','2026-09-02'));
  assert.throws(()=>A.derive({...native('etsy',[]),start:'2026-09-01T00:00:00Z'},'2026-09-01','2026-09-02'));
});
test('Historical revenue controls fail on money/count drift; different native tax definitions are separately disclosed',()=>{
  const et=A.derive(native('etsy',[etsy()]),'2026-09-01','2026-09-02'),no=A.derive(native('noths',[order()]),'2026-09-01','2026-09-02'),reference={channels:{etsy:structuredClone(et),noths:no}},candidate={channels:{etsy:et,noths:no}};
  reference.channels.etsy.daily[0].tax=0;
  assert.equal(A.replay(candidate,reference).status,'matched');assert.equal(A.replay(candidate,reference).source_field_differences.length,1);
  reference.channels.etsy.daily[0].net_sales++;
  assert.equal(A.replay(candidate,reference).status,'different');assert.equal(A.replay(candidate,reference).differences[0].field,'net_sales');
});
test('Expired/missing Etsy connection never refreshes or modifies StockHub OAuth state',async()=>{
  const requests=[],env={CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_D1_DATABASE_ID:'b'.repeat(8)+'-'+ 'b'.repeat(4)+'-'+ 'b'.repeat(4)+'-'+ 'b'.repeat(4)+'-'+ 'b'.repeat(12),CLOUDFLARE_API_TOKEN:'fixture',ETSY_KEYSTRING:'fixture',ETSY_SHARED_SECRET:'fixture',NOTHS_TOKEN:'fixture'};
  await assert.rejects(Source.credentials(env,async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({success:true,result:[{results:[{shop_id:'1',access_token:'fixture',expires_at:'2020-01-01T00:00:00Z'}]}]})};}),/normal StockHub refresh/);
  assert.equal(requests.length,1);assert.match(JSON.parse(requests[0].options.body).sql,/^SELECT /);assert.ok(!requests[0].url.includes('oauth'));
});
test('Rate limits retry read requests and respect provider delay without exposing request data',async()=>{
  const pauses=[];let attempts=0;
  const response=await Source.retrying(async()=>++attempts===1?{status:429,headers:{get:()=> '3'}}:{status:200},async ms=>pauses.push(ms))('https://fixture.invalid', {method:'GET'});
  assert.equal(response.status,200);assert.deepEqual(pauses,[3000]);assert.equal(attempts,2);
});
test('Failed automatic capture retains the manifest and facts and publishes only a safe failure status',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'marketplace-auto-test-'));
  try {S.publish(dir,R.reference());const before=fs.readFileSync(path.join(dir,'manifest.json'));
    await assert.rejects(R.refresh({out:dir,now:new Date('2026-11-09T05:00:00Z'),capture:async()=>{throw Error('fixture source failure');}}));
    assert.deepEqual(fs.readFileSync(path.join(dir,'manifest.json')),before);const status=JSON.parse(fs.readFileSync(path.join(dir,'refresh-status.json')));assert.equal(status.status,'failed');assert.equal(status.source_covered_through.noths,'2026-07-31');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('Publication validation rejects missing days and a status that identifies another snapshot',()=>{
  const captures={etsy:native('etsy',[etsy()]),noths:native('noths',[order()])},ranges={etsy:{start:'2026-09-01',end:'2026-09-02'},noths:{start:'2026-09-01',end:'2026-09-02'}},s=A.build(captures,ranges);
  assert.equal(R.validate(s,{end:'2026-09-02'}).etsy.days,2);s.channels.etsy.daily.pop();assert.throws(()=>R.validate(s,{end:'2026-09-02'}));
  assert.throws(()=>P.snapshot({schema:'marketplace-sales-v1',file:'../credentials',sha256:'0'.repeat(64)},Buffer.from('{}')));
});
function publicationFixture() {
  const repo=fs.mkdtempSync(path.join(os.tmpdir(),'marketplace-publication-')),out=path.join(repo,P.ROOT);
  const git=(...args)=>cp.execFileSync('git',['-C',repo,...args],{stdio:['ignore','pipe','pipe'],encoding:'utf8'}).trim();
  git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  S.publish(out,R.reference());git('add','.');git('commit','-m','retained historical reference');
  const candidate=structuredClone(R.reference());candidate.calculation_version=A.VERSION;candidate.automatic_policy={reference_snapshot:R.REFERENCE,version:A.VERSION};
  for(const c of ['etsy','noths']) {
    const channel=candidate.channels[c];
    for(let day=require('../../contract').next(channel.daily.at(-1).date);day<='2026-11-08';day=require('../../contract').next(day))channel.daily.push({date:day,...Object.fromEntries(A.FIELDS[c].map(k=>[k,0])),completeness:'validated'});
    Object.assign(channel,{coverage:{start:channel.daily[0].date,end:'2026-11-08'},validation:A.VERSION,source_sha256:'1'.repeat(64),audit:{source_orders:channel.daily.reduce((s,r)=>s+r.orders,0),excluded_orders:0}});
  }
  function write(s=candidate) {const id=S.publish(out,s);const status={status:'success',live:true,snapshot_sha256:id,attempted_at:'2026-11-09T05:00:00Z'};fs.writeFileSync(path.join(out,'refresh-status.json'),JSON.stringify(status));return {id,status};}
  return {repo,out,candidate,write,cleanup:()=>fs.rmSync(repo,{recursive:true,force:true})};
}
test('Marketplace publisher prepares snapshot, pointer and status together and guards every owned path',()=>{
  const f=publicationFixture();try {
    const {id}=f.write(),p=P.prepare({repo:f.repo,outcome:'success',now:new Date('2026-11-09T06:00:00Z')});
    assert.equal(p.failed,false);assert.equal(p.pending.size,3);assert.ok(p.pending.has(P.ROOT+'/snapshots/'+id+'.json'));assert.ok(p.guards.has('finance/management.js'));assert.ok(p.guards.has(P.ROOT+'/manifest.json'));assert.equal(JSON.parse(p.pending.get(P.ROOT+'/refresh-status.json')).snapshot_sha256,id);
  }finally{f.cleanup();}
});
test('Hash-consistent source drift or mismatched status publishes warning only, retaining verified facts',()=>{
  for(const defect of ['control','status']) {const f=publicationFixture();try {
    if(defect==='control')f.candidate.channels.etsy.daily[0].net_sales++;
    f.write();if(defect==='status')fs.writeFileSync(path.join(f.out,'refresh-status.json'),JSON.stringify({status:'success',live:true,snapshot_sha256:'0'.repeat(64),attempted_at:'2026-11-09T05:00:00Z'}));
    const p=P.prepare({repo:f.repo,outcome:'success',now:new Date('2026-11-09T06:00:00Z')});assert.equal(p.failed,true);assert.deepEqual([...p.pending.keys()],[P.ROOT+'/refresh-status.json']);
  }finally{f.cleanup();}}
});
test('Served publication verification refuses a mixed manifest/status bundle',async()=>{
  const f=publicationFixture();try {
    const {status}=f.write(),manifest=JSON.parse(fs.readFileSync(path.join(f.out,'manifest.json')));
    const transport=async url=>{
      let bytes=fs.readFileSync(path.join(f.repo,new URL(url).pathname.slice(1)));
      if(new URL(url).pathname.endsWith('refresh-status.json'))bytes=Buffer.from(JSON.stringify({...status,snapshot_sha256:'0'.repeat(64)}));
      return {ok:true,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
    };
    await assert.rejects(P.verifyServed({baseUrl:'https://fixture.invalid/',manifest,status,transport,attempts:1}),/not verified/);
  }finally{f.cleanup();}
});
test('Published aggregate shape discards customer properties, native order identifiers and credential-like extras',()=>{
  const raw=etsy({receipt_id:91375821,buyer_email:'private-customer@example.invalid',api_key:'fixture-secret-not-for-publication'}),captures={etsy:native('etsy',[raw]),noths:native('noths',[order()])},ranges={etsy:{start:'2026-09-01',end:'2026-09-02'},noths:{start:'2026-09-01',end:'2026-09-02'}};
  const text=JSON.stringify(A.build(captures,ranges));assert.doesNotMatch(text,/private-customer|fixture-secret|91375821|buyer_email|receipt_id|access_token/);
});
