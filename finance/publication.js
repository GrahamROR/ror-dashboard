'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const F=require('./contract'),B=require('./build-staging'),R=require('./refresh');
const ROOT='finance/staging',EXPORTS=['data.json','ads-data.json','email-data.json','ltv-cac.json','dashboard2/sales-data.json'];
const PRODUCERS=['finance/contract.js','finance/management.js','finance/build-staging.js','finance/collect.js','finance/refresh.js','finance/integration.js','finance/publication.js','finance/pages-publication.js','finance/freshness.js','finance/loader.js','scripts/publish-data.js','index.html','dashboard2/calculations.js','dashboard2/ror-sales-app.js'];
function git(repo,args,options={}){return cp.execFileSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe'],...options}).trim();}
function blob(repo,rev,file){try{return cp.execFileSync('git',['-C',repo,'show',rev+':'+file],{maxBuffer:64*1024*1024,stdio:['pipe','pipe','pipe']});}catch(error){if(error.status===128)return null;throw error;}}
function same(a,b){return a===null?b===null:b!==null&&a.equals(b);}
function readSnapshot(manifest,bytes){assert.match(manifest.file,/^snapshots\/[a-f0-9]{64}\.json$/);assert.equal(B.hash(bytes),manifest.sha256);const s=JSON.parse(bytes),{id,...body}=s;assert.equal(s.schema,F.VERSION);assert.equal(id,manifest.snapshot_id);assert.equal(B.hash(JSON.stringify(body)),id);return s;}
function validate(s){
 assert.equal(s.store.currency,'GBP');assert.equal(s.store.timezone,'Europe/London');assert.equal(s.store.domain,'rockonruby.myshopify.com');
 const full=F.select(s,s.coverage.start,s.coverage.end);assert.equal(full.missingDays,0);assert.equal(full.status,'actual');
 const periods=s.periods.filter(p=>p.start!==p.end);assert.ok(periods.length>0);
 for(const p of s.periods){const a=F.select(s,p.start,p.end);for(const k of F.ADDITIVE){assert.notEqual(p[k],null);assert.equal(a[k],p[k]);}if(p.start!==p.end)for(const k of F.MONEY)assert.equal(F.products(s,p.start,p.end,k).status,'reconciled');}
 for(let d=s.coverage.start;d<=s.coverage.end;){const end=new Date(Date.UTC(+d.slice(0,4),+d.slice(5,7),0)).toISOString().slice(0,10),e=end<s.coverage.end?end:s.coverage.end;assert.ok(s.periods.some(p=>p.start===d&&p.end===e),'Missing independent monthly control');d=F.next(e);}
 for(const d of s.days){assert.equal(d.net_sales,d.gross_sales+d.discounts+d.sales_reversals);assert.ok(Number.isSafeInteger(d.orders)&&d.orders>=0);}
 return {start:s.coverage.start,end:s.coverage.end,days:s.days.length,nativeControls:periods.length};
}
function json(b){return Buffer.from(JSON.stringify(b,null,2)+'\n');}
function prepare({repo,files=[],financeOutcome='skipped',rollbackId=null,now=new Date()}){
 for(const file of files)if(!EXPORTS.includes(file))throw Error('Unapproved export path');
 const base=git(repo,['rev-parse','HEAD']),pending=new Map(),guards=new Map();
 for(const file of files){const bytes=fs.readFileSync(path.join(repo,file));JSON.parse(bytes);pending.set(file,bytes);guards.set(file,blob(repo,base,file));}
 if(files.includes('ltv-cac.json')){const D=require('./dependencies'),output=JSON.parse(pending.get('ltv-cac.json'));D.guard(output,D.load(repo));for(const file of [ROOT+'/manifest.json',ROOT+'/refresh-status.json','data.json','finance/dependencies.js','scripts/fetch-ltv-cac.js'])guards.set(file,blob(repo,base,file));}
 let failed=false;
 if(financeOutcome!=='skipped'||rollbackId){
  const manifestPath=ROOT+'/manifest.json',statusPath=ROOT+'/refresh-status.json',oldBytes=blob(repo,base,manifestPath);assert.ok(oldBytes,'Retained finance manifest required');const oldM=JSON.parse(oldBytes),oldS=readSnapshot(oldM,blob(repo,base,ROOT+'/'+oldM.file));validate(oldS);
  guards.set(manifestPath,oldBytes);guards.set(statusPath,blob(repo,base,statusPath));for(const file of PRODUCERS)guards.set(file,blob(repo,base,file));
  let s,m,status;
  if(rollbackId){assert.match(rollbackId,/^[a-f0-9]{64}$/);const file='snapshots/'+rollbackId+'.json',bytes=blob(repo,base,ROOT+'/'+file);assert.ok(bytes,'Rollback snapshot must already be retained');m={snapshot_id:rollbackId,file,sha256:B.hash(bytes),previous_snapshot_id:oldS.id,approval:oldM.approval};s=readSnapshot(m,bytes);status={status:'rolled-back',attempted_at:now.toISOString(),snapshot_id:s.id,previous_snapshot_id:oldS.id,verification:validate(s),warning:'Financial snapshot rolled back; automatic refresh remains paused.'};
  }else{
   try{
    assert.equal(financeOutcome,'success');m=JSON.parse(fs.readFileSync(path.join(repo,manifestPath)));const bytes=fs.readFileSync(path.join(repo,ROOT,m.file));s=readSnapshot(m,bytes);const verification=validate(s);const supplied=JSON.parse(fs.readFileSync(path.join(repo,statusPath)));assert.equal(supplied.status,'success');assert.equal(supplied.snapshot_id,s.id);assert.equal(s.coverage.end,R.endYesterday(new Date(supplied.attempted_at)));assert.equal(s.coverage.start,oldS.coverage.start);assert.ok(s.coverage.end>=oldS.coverage.end,'Coverage regression');assert.equal(s.store.id,oldS.store.id);assert.equal(m.previous_snapshot_id,s.id===oldS.id?oldM.previous_snapshot_id:oldS.id);const existing=blob(repo,base,ROOT+'/'+m.file);if(existing)assert.ok(existing.equals(bytes),'Immutable snapshot changed');m={...m,approval:'Canonical commercial reporting; production publication requires explicit activation'};pending.set(ROOT+'/'+m.file,bytes);guards.set(ROOT+'/'+m.file,existing);status={...supplied,verification,producer_revision:base,last_successful_at:supplied.completed_at||supplied.attempted_at};
   }catch{
    failed=true;m=oldM;s=oldS;const retainedStatusBytes=blob(repo,base,statusPath),retainedStatus=retainedStatusBytes?JSON.parse(retainedStatusBytes):{};status={last_successful_at:retainedStatus.last_successful_at||(retainedStatus.status==='success'?retainedStatus.completed_at||retainedStatus.attempted_at:null),status:'failed',attempted_at:now.toISOString(),snapshot_id:s.id,verification:validate(s),requested_through:R.endYesterday(now),warning:'Shopify financial refresh failed validation or collection; last verified snapshot retained.',producer_revision:base};
   }
  }
  // Failed batches publish warning metadata only, never their new manifest/facts.
  if(!failed)pending.set(manifestPath,json(m));pending.set(statusPath,json(status));
 }
 return {base,pending,guards,failed};
}
function publish({repo,remote='origin',branch,prepared,attempts=3,beforePush=null,push=null}){
 assert.match(branch,/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/);assert.ok(!branch.includes('..'));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ror-publication-index-'));let lastCommit=null;
 try{for(let attempt=0;attempt<attempts;attempt++){
  git(repo,['fetch',remote,'refs/heads/'+branch]);const tip=git(repo,['rev-parse','FETCH_HEAD']);
  for(const[file,expected]of prepared.guards){const current=blob(repo,tip,file),desired=prepared.pending.get(file);if(!same(current,expected)&&!(desired&&same(current,desired)))throw Error('Concurrent owned file or finance producer changed; restart collection: '+file);}
  const changed=[...prepared.pending].filter(([file,bytes])=>!same(blob(repo,tip,file),bytes));if(!changed.length)return {published:!!lastCommit,confirmed:true,revision:tip,failed:prepared.failed,paths:[]};
  const env={...process.env,GIT_INDEX_FILE:path.join(temp,'index')};git(repo,['read-tree',tip],{env});
  for(const[file,bytes]of changed){const hash=git(repo,['hash-object','-w','--stdin'],{input:bytes});git(repo,['update-index','--add','--cacheinfo','100644',hash,file],{env});}
  const tree=git(repo,['write-tree'],{env});lastCommit=git(repo,['commit-tree',tree,'-p',tip],{input:'chore: validated dashboard publication\n',env:{...env,GIT_AUTHOR_NAME:'ror-dashboard[bot]',GIT_AUTHOR_EMAIL:'dashboard@rockonruby.co.uk',GIT_COMMITTER_NAME:'ror-dashboard[bot]',GIT_COMMITTER_EMAIL:'dashboard@rockonruby.co.uk'}});
  if(beforePush)beforePush({attempt,tip,commit:lastCommit});
  try{if(push)push(lastCommit,branch);else git(repo,['push',remote,lastCommit+':refs/heads/'+branch]);return {published:true,confirmed:true,revision:lastCommit,failed:prepared.failed,paths:changed.map(([f])=>f)};}catch{/* Fetch/recheck before retry; no force, rebase or overwrite of changed owned paths. */}
 }
 throw Error('Publication push failed after bounded retries; no success assumed');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
module.exports={prepare,publish,validate,readSnapshot,EXPORTS,ROOT};
