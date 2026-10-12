// Approved main-only callers request legacy Pages builds explicitly after confirmed Git publication.
'use strict';
const cp=require('node:child_process'),assert=require('node:assert/strict'),P=require('./publication');
async function requestBuild({repo,repository,token,revision,transport=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),polls=40}){
 assert.match(repository,/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);assert.ok(token,'Pages workflow token required');assert.match(revision,/^[a-f0-9]{40}$/);
 const base='https://api.github.com/repos/'+repository,headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 async function api(suffix,method='GET'){const r=await transport(base+suffix,{method,headers,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Pages '+method+' failed HTTP '+r.status);return r.json();}
 const site=await api('/pages'),metadata=await api('');assert.equal(metadata.default_branch,'main');assert.equal(site.build_type,'legacy');assert.equal(site.source.branch,'main');assert.equal(site.source.path,'/');
 cp.execFileSync('git',['-C',repo,'fetch','origin','main'],{stdio:['ignore','pipe','pipe']});
 const current=cp.execFileSync('git',['-C',repo,'rev-parse','FETCH_HEAD'],{encoding:'utf8'}).trim();cp.execFileSync('git',['-C',repo,'merge-base','--is-ancestor',revision,current],{stdio:['ignore','pipe','pipe']});
 const preRead=file=>cp.execFileSync('git',['-C',repo,'show',current+':'+file],{maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']});const preManifest=JSON.parse(preRead(P.ROOT+'/manifest.json')),preSnapshot=P.readSnapshot(preManifest,preRead(P.ROOT+'/'+preManifest.file));P.validate(preSnapshot);assert.equal(JSON.parse(preRead(P.ROOT+'/refresh-status.json')).snapshot_id,preSnapshot.id);
 await api('/pages/builds','POST');
 for(let i=0;i<polls;i++){
  const build=await api('/pages/builds/latest');
  if(build.status==='errored')throw Error('Pages build failed; validated Git publication retained');
  if(build.status==='built'&&/^[a-f0-9]{40}$/.test(build.commit||'')){
   cp.execFileSync('git',['-C',repo,'fetch','origin','main'],{stdio:['ignore','pipe','pipe']});
   let includes=false;try{cp.execFileSync('git',['-C',repo,'merge-base','--is-ancestor',revision,build.commit],{stdio:['ignore','pipe','pipe']});includes=true;}catch{}
   if(includes){
    const read=file=>cp.execFileSync('git',['-C',repo,'show',build.commit+':'+file],{maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']});const manifest=JSON.parse(read(P.ROOT+'/manifest.json')),snapshot=P.readSnapshot(manifest,read(P.ROOT+'/'+manifest.file)),status=JSON.parse(read(P.ROOT+'/refresh-status.json'));assert.equal(status.snapshot_id,snapshot.id);
    const publicUrl=file=>new URL(file,site.html_url).toString()+'?publication='+build.commit;
    async function served(file){const r=await transport(publicUrl(file),{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Published Pages file unavailable HTTP '+r.status);return Buffer.from(await r.arrayBuffer());}
    try{const servedManifest=JSON.parse(await served(P.ROOT+'/manifest.json'));assert.deepEqual(servedManifest,manifest);const servedSnapshot=P.readSnapshot(servedManifest,await served(P.ROOT+'/'+manifest.file));assert.equal(servedSnapshot.id,snapshot.id);assert.deepEqual(JSON.parse(await served(P.ROOT+'/refresh-status.json')),status);return {status:'verified',deployed_revision:build.commit,snapshot_id:snapshot.id};}catch{/* Allow bounded CDN propagation; never claim served publication before identity matches. */}
   }
  }
  if(i+1<polls)await wait(15000);
 }
 throw Error('Pages publication not verified within deadline; Git data remains intact');
}
module.exports={requestBuild};
