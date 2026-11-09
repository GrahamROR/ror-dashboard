'use strict';
const fs=require('node:fs'),path=require('node:path');
const A=require('./api-normalize'),Source=require('./api-source'),Store=require('./store'),F=require('../contract'),R=require('../refresh'),E=require('./etsy');
const ROOT=path.join(__dirname,'staging');
const REFERENCE='a461901ae78b160064be86eaade0ddce385942245dd3d26b1dcc227081ec2804';
function reference(root=ROOT) {
  const bytes=fs.readFileSync(path.join(root,'snapshots',REFERENCE+'.json'));
  if(E.hash(bytes)!==REFERENCE)throw Error('Historical marketplace controls failed integrity check');
  return JSON.parse(bytes);
}
function validate(snapshot,{end,previous}={}) {
  if(snapshot.schema!=='marketplace-sales-v1'||snapshot.currency!=='GBP'||snapshot.timezone!=='Europe/London'||snapshot.calculation_version!==A.VERSION)throw Error('Invalid automatic marketplace contract');
  const result={};
  for(const c of ['etsy','noths']) {
    const channel=snapshot.channels?.[c],rows=channel?.daily;
    if(!Array.isArray(rows)||!rows.length||channel.validation!==A.VERSION||!/^[a-f0-9]{64}$/.test(channel.source_sha256||''))throw Error('Incomplete native channel evidence');
    const start=channel.coverage?.start,last=channel.coverage?.end;
    F.day(start);F.day(last);
    if((end&&last!==end)||start>last||rows[0].date!==start||rows.at(-1).date!==last)throw Error('Incomplete native channel coverage');
    let date=start;
    for(const row of rows) {
      if(row.date!==date||row.completeness!=='validated'||A.FIELDS[c].some(k=>!Number.isSafeInteger(row[k]))||row.orders<0)throw Error('Invalid/missing native day');
      date=F.next(date);
    }
    if(date!==F.next(last))throw Error('Native range is not contiguous');
    if(previous?.channels?.[c]?.daily?.length&&(start>previous.channels[c].daily[0].date||last<previous.channels[c].daily.at(-1).date))throw Error('Marketplace coverage regression');
    if(rows.reduce((s,r)=>s+r.orders,0)!==channel.audit.source_orders-channel.audit.excluded_orders)throw Error('Native eligible/source count does not reconcile');
    if(c==='etsy'&&rows.some(r=>r.net_sales!==r.gross_sales-r.discounts))throw Error('Etsy source components do not reconcile');
    result[c]={start,end:last,days:rows.length,orders:rows.reduce((s,r)=>s+r.orders,0),source_sha256:channel.source_sha256};
  }
  return result;
}
async function refresh({env=process.env,out=ROOT,now=new Date(),capture=Source.capture,verifyOnly=false,requireReplay=false}={}) {
  const previous=Store.read(out)||reference(),end=R.endYesterday(now),ranges={};
  for(const c of ['etsy','noths'])ranges[c]={start:previous.channels[c].daily[0].date,end};
  const attempted_at=now.toISOString();
  try {
    const captures=await capture(env,ranges,{now}),snapshot=A.build(captures,ranges,previous),verification=validate(snapshot,{end,previous}),controls=A.replay(snapshot,reference());
    if(controls.status!=='matched')throw Error('Native/API policy has not reproduced accepted historical reporting controls');
    snapshot.automatic_policy={version:A.VERSION,reference_snapshot:REFERENCE,historical_reporting_controls:'recomputed on every refresh',source_field_differences:controls.source_field_differences};
    if(verifyOnly)return {snapshot,verification,controls};
    const id=Store.publish(out,snapshot);
    fs.writeFileSync(path.join(out,'refresh-status.json.tmp'),JSON.stringify({status:'success',live:true,attempted_at,completed_at:new Date().toISOString(),snapshot_sha256:id,calculation_version:A.VERSION,mechanism:'Automatic read-only marketplace APIs; existing management maths; StockHub owns OAuth refresh',source_covered_through:Object.fromEntries(Object.entries(verification).map(([c,v])=>[c,v.end])),verification,historical_control_comparison:{status:controls.status,differences:controls.differences.length}},null,2)+'\n');
    fs.renameSync(path.join(out,'refresh-status.json.tmp'),path.join(out,'refresh-status.json'));
    return {snapshot,verification,controls,id};
  } catch(error) {
    if(!verifyOnly) {
      fs.mkdirSync(out,{recursive:true});
      fs.writeFileSync(path.join(out,'refresh-status.json.tmp'),JSON.stringify({status:'failed',live:true,attempted_at,requested_through:end,warning:'Automatic marketplace refresh failed; last validated snapshot retained.',source_covered_through:Object.fromEntries(['etsy','noths'].map(c=>[c,previous.channels[c].daily.at(-1).date]))},null,2)+'\n');
      fs.renameSync(path.join(out,'refresh-status.json.tmp'),path.join(out,'refresh-status.json'));
    }
    throw error;
  }
}
module.exports={ROOT,REFERENCE,reference,validate,refresh};
