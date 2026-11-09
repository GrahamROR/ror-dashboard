'use strict';
const fs=require('node:fs'),path=require('node:path');
const A=require('./api-normalize'),F=require('../contract'),Source=require('./api-source'),B=require('./historical-backfill');
async function checkCounts({archive,env=process.env,transport=fetch}){
 const fetcher=Source.retrying(transport),result={};
 for(const channel of ['etsy','noths']){
  const data=archive.channels[channel],expected=data.audit.source_orders;
  if(!Number.isSafeInteger(expected)||expected<1)throw Error('Historical source count evidence missing');
  const boundary=A.midnight(F.next(data.coverage.end));
  if(channel==='etsy'){
   const auth=await Source.credentials(env,transport),u=new URL('https://openapi.etsy.com/v3/application/shops/'+auth.ETSY_SHOP_ID+'/receipts');
   for(const[k,v]of Object.entries({min_created:Math.floor(Date.parse(A.midnight(data.coverage.start))/1000),max_created:Math.floor(Date.parse(boundary)/1000)-1,sort_on:'created',sort_order:'asc',limit:1,offset:0}))u.searchParams.set(k,v);
   const response=await fetcher(u,{method:'GET',headers:{'x-api-key':auth.ETSY_KEYSTRING+':'+auth.ETSY_SHARED_SECRET,Authorization:'Bearer '+auth.ETSY_ACCESS_TOKEN}});
   if(!response.ok)throw Error('Historical source count read failed');
   const body=await response.json();if(body.count!==expected||body.results?.length!==1)throw Error('Etsy historical source count mismatch');
   result.etsy={status:'matched',historical_source_orders:expected,provider_window_count:body.count,method:'Independent server-bounded historical receipt count'};
  }else{
   const checks=[];let total=0;
   for(const offset of [expected-1,expected]){
    const u=new URL('https://api.notonthehighstreet.com/api/v1/orders');
    for(const[k,v]of Object.entries({token:env.NOTHS_TOKEN,sort:'placed_at',dir:'asc',per_page:1,offset}))u.searchParams.set(k,v);
    const response=await fetcher(u,{method:'GET'});if(!response.ok)throw Error('Historical source rank read failed');
    const body=await response.json(),stamp=Date.parse(body.data?.[0]?.placed_at);
    if(body.data?.length!==1||!Number.isFinite(stamp)||!Number.isSafeInteger(body.query?.total)||body.query.total<=expected)throw Error('Historical source rank evidence incomplete');
    checks.push(offset===expected-1?stamp<Date.parse(boundary):stamp>=Date.parse(boundary));total=Math.max(total,body.query.total);
   }
   if(!checks.every(Boolean))throw Error('NOTHS historical boundary rank mismatch');
   result.noths={status:'matched',historical_source_orders:expected,boundary_rank:expected,before_boundary:true,at_or_after_boundary:true,provider_total_at_check:total,method:'Independent ascending API ranks immediately before and after the historical/live boundary'};
  }
 }
 return {schema:'historical-api-count-check-v1',status:'coverage-verified',checked_at:new Date().toISOString(),definition:'Order-count completeness only. This does not certify accounting definitions or independent financial reconciliation.',channels:result};
}
async function run({repo=B.ROOT,env=process.env,transport=fetch}={}){
 const pointer=JSON.parse(fs.readFileSync(path.join(repo,'finance/marketplaces/historical/manifest.json')));
 if(!/^snapshots\/[a-f0-9]{64}\.json$/.test(pointer.file))throw Error('Invalid historical archive pointer');
 const bytes=fs.readFileSync(path.join(repo,'finance/marketplaces/historical',pointer.file));
 if(require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==pointer.sha256)throw Error('Historical archive integrity failed');
 const archive=B.validate(JSON.parse(bytes),B.liveBoundaries(repo)),proof=await checkCounts({archive,env,transport});
 const result={...proof,archive_sha256:pointer.sha256},file=path.join(repo,'finance/historical/coverage-check.json');B.rejectLive(file,repo);B.atomic(file,result,0o644);return result;
}
module.exports={checkCounts,run};
