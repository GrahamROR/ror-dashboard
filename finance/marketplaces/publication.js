'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const E=require('./etsy'),A=require('./automatic-refresh');
const ROOT='finance/marketplaces/staging';
const PRODUCERS=['finance/marketplaces/api-normalize.js','finance/marketplaces/api-source.js','finance/marketplaces/automatic-refresh.js','finance/marketplaces/publication.js','finance/marketplaces/collect.js','finance/marketplaces/store.js','finance/marketplaces/contract.js','finance/management.js','finance/publication.js','scripts/refresh-marketplace-finance.js','.github/workflows/marketplace-finance-refresh.yml'];
function blob(repo,rev,file) {try{return cp.execFileSync('git',['-C',repo,'show',rev+':'+file],{stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});}catch(e){if(e.status===128)return null;throw e;}}
function snapshot(manifest,bytes) {
  if(manifest.schema!=='marketplace-sales-v1'||!/^snapshots\/[a-f0-9]{64}\.json$/.test(manifest.file)||E.hash(bytes)!==manifest.sha256)throw Error('Marketplace publication integrity failure');
  const data=JSON.parse(bytes);
  if(data.schema!==manifest.schema)throw Error('Marketplace publication schema mismatch');
  return data;
}
function prepare({repo,outcome,now=new Date()}) {
  const base=cp.execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),pending=new Map(),guards=new Map();
  const manifestPath=ROOT+'/manifest.json',statusPath=ROOT+'/refresh-status.json',oldBytes=blob(repo,base,manifestPath),old=JSON.parse(oldBytes),prior=snapshot(old,blob(repo,base,ROOT+'/'+old.file));
  for(const file of [manifestPath,statusPath,...PRODUCERS])guards.set(file,blob(repo,base,file));
  let failed=outcome!=='success',status;
  if(!failed) {
    try {
      const manifest=JSON.parse(fs.readFileSync(path.join(repo,manifestPath))),bytes=fs.readFileSync(path.join(repo,ROOT,manifest.file)),candidate=snapshot(manifest,bytes);
      status=JSON.parse(fs.readFileSync(path.join(repo,statusPath)));
      if(status.status!=='success'||!status.live||status.snapshot_sha256!==manifest.sha256)throw Error('Marketplace publication status mismatch');
      const end=require('../refresh').endYesterday(new Date(status.attempted_at));
      A.validate(candidate,{end,previous:prior});
      if(candidate.automatic_policy?.reference_snapshot!==A.REFERENCE||candidate.automatic_policy.version!==require('./api-normalize').VERSION||require('./api-normalize').replay(candidate,A.reference()).status!=='matched')throw Error('Historical marketplace reporting controls failed');
      const file=ROOT+'/'+manifest.file,existing=blob(repo,base,file);
      if(existing&&!existing.equals(bytes))throw Error('Immutable marketplace snapshot changed');
      pending.set(file,bytes);guards.set(file,existing);pending.set(manifestPath,Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
    } catch {failed=true;}
  }
  if(failed)status={status:'failed',live:true,attempted_at:now.toISOString(),snapshot_sha256:old.sha256,warning:'Automatic marketplace refresh failed; last validated snapshot retained.',source_covered_through:Object.fromEntries(['etsy','noths'].map(c=>[c,prior.channels[c].daily.at(-1).date]))};
  pending.set(statusPath,Buffer.from(JSON.stringify({...status,producer_revision:base},null,2)+'\n'));
  return {base,pending,guards,failed};
}
async function verifyServed({baseUrl,manifest,status,transport=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=8}) {
  for(let attempt=0;attempt<attempts;attempt++) {
    try {
      const read=async file=>{const u=new URL(ROOT+'/'+file,baseUrl);u.searchParams.set('snapshot',manifest.sha256);const r=await transport(u,{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Published marketplace file unavailable');return Buffer.from(await r.arrayBuffer());};
      const m=JSON.parse(await read('manifest.json'));
      if(m.sha256!==manifest.sha256||m.file!==manifest.file)throw Error('Published marketplace manifest is not current');
      snapshot(m,await read(m.file));
      const s=JSON.parse(await read('refresh-status.json'));
      if(s.snapshot_sha256!==status.snapshot_sha256||s.status!==status.status||s.producer_revision!==status.producer_revision)throw Error('Published marketplace status is not current');
      return {status:'verified',snapshot_sha256:manifest.sha256};
    } catch {if(attempt+1<attempts)await wait(15000);}
  }
  throw Error('Published marketplace bundle was not verified within the deadline');
}
module.exports={prepare,snapshot,verifyServed,ROOT};
