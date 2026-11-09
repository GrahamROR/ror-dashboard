'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const B=require('../marketplaces/historical-backfill'),M=require('../management'),Legacy=require('./legacy-shopify');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function controls(archive,input){
 const references=new Map((input.records||[]).filter(r=>['etsy','noths'].includes(r.channel)).map(r=>[r.channel+':'+r.period,r]));
 const rows=[];
 for(const channel of ['etsy','noths']){
  const data=archive.channels[channel],allocation=M.allocatedVAT(data.daily,channel);
  for(const month of data.months){
   const ref=references.get(channel+':'+month.month),days=data.daily.filter(d=>d.date.startsWith(month.month));
   const original=(channel==='etsy'?month.total_sales:month.customer_total)/100,net=days.reduce((n,d)=>n+allocation.get(d.date),0)/100;
   const full=month.start===month.month+'-01'&&month.end===require('./reporting').monthEnd(month.month);
   const delta=ref?.revenue==null?null:Math.round((original-ref.revenue)*100)/100,orderDelta=ref?.orders==null?null:month.orders-ref.orders;
   rows.push({channel,period:month.month,coverage_start:month.start,coverage_end:month.end,native_original_total:original,management_net_sales:net,native_orders:month.orders,workbook_recorded_revenue:ref?.revenue??null,workbook_recorded_orders:ref?.orders??null,original_total_difference:delta,orders_difference:orderDelta,status:!ref?'reference-unavailable':!full?'partial-source-month':delta==null||orderDelta==null?'reference-incomplete':Math.abs(delta)>0.01||orderDelta!==0?'difference':'within-rounding-tolerance'});
  }
 }
 return {schema:'historical-source-controls-v1',role:'informational-only',revenue_tolerance_pounds:0.01,orders_tolerance:0,definition:'Native original receipt totals and approved management Net Sales are shown separately. Workbook revenue basis is unconfirmed. Differences are disclosed, never balanced, and do not certify historical data.',summary:{rows:rows.length,comparable_months:rows.filter(r=>['difference','within-rounding-tolerance'].includes(r.status)).length,flagged_months:rows.filter(r=>r.status==='difference').length},rows};
}
function create({repo=B.ROOT,input=path.join(repo,'local-data/dashboard2-real-data.json')}={}){
 const pointer=JSON.parse(fs.readFileSync(path.join(repo,'finance/marketplaces/historical/manifest.json')));
 if(!/^snapshots\/[a-f0-9]{64}\.json$/.test(pointer.file))throw Error('Invalid archive file path');
 const archiveFile='finance/marketplaces/historical/'+pointer.file,bytes=fs.readFileSync(path.join(repo,archiveFile));
 if(digest(bytes)!==pointer.sha256)throw Error('Historical archive integrity failed');
 const archive=B.validate(JSON.parse(bytes),B.liveBoundaries(repo));
 const coverageFile='finance/historical/coverage-check.json',coverageBytes=fs.readFileSync(path.join(repo,coverageFile)),coverage=JSON.parse(coverageBytes);
 if(coverage.status!=='coverage-verified'||coverage.archive_sha256!==pointer.sha256||['etsy','noths'].some(c=>coverage.channels?.[c]?.status!=='matched'||coverage.channels[c].historical_source_orders!==archive.channels[c].audit.source_orders))throw Error('Historical API coverage check missing or stale');
 const legacy=Legacy.readPrivate({repo,input}),legacyFile='finance/historical/shopify-legacy.json',legacyBytes=Buffer.from(JSON.stringify(legacy,null,2)+'\n');
 const report=controls(archive,JSON.parse(fs.readFileSync(input)));
 const privateCache=B.paths({repo}).cache;
 B.atomic(path.join(privateCache,'control-report.json'),report);
 const registry={schema:'ror-historical-bundle-v1',marketplaces:{file:archiveFile,sha256:pointer.sha256},shopify:{file:legacyFile,sha256:digest(legacyBytes)},coverage:{file:coverageFile,sha256:digest(coverageBytes)}};
 const registryFile=path.join(repo,'finance/historical/manifest.json');B.rejectLive(registryFile,repo);B.rejectLive(path.join(repo,legacyFile),repo);
 B.atomic(path.join(repo,legacyFile),legacy,0o644);
 B.atomic(registryFile,registry,0o644);
 return {registry,controls:report.summary,legacy_months:legacy.months.length};
}
module.exports={controls,create,digest};
