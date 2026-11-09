'use strict';
const fs = require('node:fs'), path = require('node:path');
const C = require('./collect'), A = require('./api-normalize'), H = require('./historical-source'), Source = require('./api-source'), Store = require('./store'), F = require('../contract');
const ROOT = path.resolve(__dirname, '../..');
const VERSION = 'historical-marketplace-backfill-v1';
const CONFIDENCE = 'historical-api-backfill';
const previous = day => { F.day(day); const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); };
function chunks(start, end, unit = 'year') {
  F.day(start); F.day(end); const result = [];
  if (!['year','month'].includes(unit) || start > end) throw Error('Invalid historical interval');
  for (let cursor = start; cursor <= end;) {
    const y = +cursor.slice(0,4), m = +cursor.slice(5,7);
    const boundary = unit === 'year' ? (y+1)+'-01-01' : new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
    const last = previous(boundary) < end ? previous(boundary) : end;
    result.push({start: cursor, end: last, year: y}); cursor = F.next(last);
  }
  return result;
}
function canonical(file) {
  let p = path.resolve(file), suffix = [];
  while (!fs.existsSync(p)) { suffix.unshift(path.basename(p)); p = path.dirname(p); }
  return path.join(fs.realpathSync(p), ...suffix);
}
function within(file, root) { return file === root || file.startsWith(root + path.sep); }
function rejectLive(file, repo = ROOT) {
  const target = canonical(file);
  for (const base of [canonical(repo), canonical(ROOT)]) for (const live of ['finance/staging','finance/marketplaces/staging']) if (within(target,path.join(base,live))) throw Error('Historical work cannot write live financial paths');
  return target;
}
function paths({repo = ROOT, cache = path.join(repo,'finance/local-data/historical-backfill'), out = path.join(repo,'finance/marketplaces/historical')} = {}) {
  const r = canonical(repo), c = canonical(cache), o = canonical(out);
  for (const base of [r, canonical(ROOT)]) for (const live of ['finance/staging','finance/marketplaces/staging']) {
    const protectedPath = path.join(base, live);
    if (within(o,protectedPath) || within(c,protectedPath)) throw Error('Historical work cannot write live financial paths');
  }
  if (within(c,r) && !within(c,path.join(r,'finance/local-data'))) throw Error('Raw historical cache must remain private and ignored');
  if (within(o,r) && o !== path.join(r,'finance/marketplaces/historical')) throw Error('Historical output must use the separate archive path');
  return {repo:r, cache:c, out:o};
}
function atomic(file, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(value,null,2)+'\n', {mode}); fs.renameSync(tmp,file);
}
function liveBoundaries(repo = ROOT) {
  const live = Store.read(path.join(repo,'finance/marketplaces/staging'));
  if (!live) throw Error('Live marketplace boundary evidence missing');
  return Object.fromEntries(['etsy','noths'].map(c => {
    const day = live.channels?.[c]?.daily?.[0]?.date; F.day(day); return [c,day];
  }));
}
async function discover(channel, env, transport = fetch) {
  const auth = channel === 'etsy' ? await Source.credentials(env) : env;
  const url = new URL(channel === 'etsy' ? 'https://openapi.etsy.com/v3/application/shops/'+auth.ETSY_SHOP_ID+'/receipts' : 'https://api.notonthehighstreet.com/api/v1/orders');
  const params = channel === 'etsy' ? {sort_on:'created',sort_order:'asc',limit:1,offset:0} : {token:auth.NOTHS_TOKEN,sort:'placed_at',dir:'asc',per_page:1,offset:0};
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const response = await transport(url,{method:'GET',headers:channel==='etsy'?{'x-api-key':auth.ETSY_KEYSTRING+':'+auth.ETSY_SHARED_SECRET,Authorization:'Bearer '+auth.ETSY_ACCESS_TOKEN}:{},signal:AbortSignal.timeout(90000)});
  if (!response.ok) throw Error('Historical depth read failed');
  const body = await response.json(), rows = channel==='etsy'?body.results:body.data;
  if (rows?.length!==1) throw Error('Historical depth evidence missing');
  const day=C.londonDay(channel==='etsy'?rows[0].create_timestamp*1000:rows[0].placed_at);
  return {earliest_day:day,total_source_orders:channel==='etsy'?body.count:body.query?.total,probed_at:new Date().toISOString()};
}
function checkpointName(channel, range) { return channel+'-'+range.start+'-'+range.end+'.json'; }
function saveCheckpoint(file, result, range, boundary) {
  A.derive(result.capture,range.start,range.end);
  const data={version:VERSION,channel:result.capture.channel,start:range.start,end:range.end,live_start_at_capture:boundary,capture:result.capture,initial_offset:result.initial_offset,resume_offset:result.resume_offset,audit:result.audit};
  atomic(file,{...data,sha256:H.hash(data)});
}
function readCheckpoint(file, range, channel, initialOffset, boundary) {
  if (!fs.existsSync(file)) return null;
  const stored=JSON.parse(fs.readFileSync(file)),{sha256,...data}=stored;
  if (sha256!==H.hash(data) || data.version!==VERSION || data.channel!==channel || data.start!==range.start || data.end!==range.end || data.initial_offset!==initialOffset || data.live_start_at_capture!==boundary) throw Error('Historical checkpoint integrity or cursor mismatch');
  return {...data,derived:A.derive(data.capture,range.start,range.end)};
}
function compose(results, boundaries, discovery) {
  const channels={};
  for (const channel of ['etsy','noths']) {
    const parts=results[channel]; if (!parts?.length) throw Error('Both historical channels are required');
    const daily=[],months=[],audit={source_orders:0,excluded_orders:0,native_gbp_mapped_orders:0,native_component_rounding_orders:0,native_component_delta_pennies:0,listing_reference_difference_orders:0,listing_reference_delta_pennies:0,purchase_currency_counts:{}};
    const proofs=[];let next=parts[0].start;
    for (const part of parts) {
      if(part.start!==next || part.end>=boundaries[channel]) throw Error('Historical chunk overlap or gap');
      next=F.next(part.end);
      for(const row of part.derived.daily)daily.push({date:row.date,...Object.fromEntries(A.FIELDS[channel].map(k=>[k,row[k]])),completeness:CONFIDENCE});
      for(const row of part.derived.months)months.push({month:row.month,start:row.start,end:row.end,...Object.fromEntries(A.FIELDS[channel].map(k=>[k,row[k]])),validation:CONFIDENCE});
      audit.source_orders+=part.capture.count; audit.excluded_orders+=part.derived.audit.excluded_orders;
      for(const k of ['native_gbp_mapped_orders','native_component_rounding_orders','native_component_delta_pennies','listing_reference_difference_orders','listing_reference_delta_pennies'])audit[k]+=part.audit?.[k]||0;
      for(const[k,v]of Object.entries(part.audit?.purchase_currency_counts||{}))audit.purchase_currency_counts[k]=(audit.purchase_currency_counts[k]||0)+v;
      proofs.push({start:part.start,end:part.end,source_orders:part.capture.count,pages:part.capture.pages,initial_offset:part.initial_offset,resume_offset:part.resume_offset,source_sha256:part.source_sha256||H.hash(part.capture),source_mapping_policy:part.audit?.mapping_policy||'native-no-mapping',native_gbp_mapped_orders:part.audit?.native_gbp_mapped_orders||0,native_component_rounding_orders:part.audit?.native_component_rounding_orders||0,native_component_delta_pennies:part.audit?.native_component_delta_pennies||0,listing_reference_difference_orders:part.audit?.listing_reference_difference_orders||0,listing_reference_delta_pennies:part.audit?.listing_reference_delta_pennies||0,native_response_sha256:H.hash(part.audit?.page_response_sha256||[])});
    }
    if(next!==boundaries[channel])throw Error('Historical channel stops short of the live boundary');
    channels[channel]={daily,months,coverage:{start:daily[0].date,end:daily.at(-1).date},live_start_at_capture:boundaries[channel],confidence:CONFIDENCE,validation:'source-checked-only',source_sha256:H.hash(proofs),audit,identity_check:'Native order IDs checked for uniqueness across every private capture chunk',chunks:proofs};
  }
  const archive={schema:'marketplace-sales-v1',historical:true,validated:false,confidence:CONFIDENCE,currency:'GBP',timezone:'Europe/London',calculation_version:A.VERSION,backfill_version:VERSION,source_mapping_policy:H.MAPPING,discovery:Object.fromEntries(['etsy','noths'].map(c=>[c,{earliest_day:discovery[c].earliest_day,total_source_orders:discovery[c].total_source_orders,probed_at:discovery[c].probed_at}])),channels};
  validate(archive,boundaries);return archive;
}
function validate(archive,boundaries) {
  if(archive.schema!=='marketplace-sales-v1'||archive.historical!==true||archive.validated!==false||archive.confidence!==CONFIDENCE||archive.currency!=='GBP'||archive.timezone!=='Europe/London'||archive.calculation_version!==A.VERSION)throw Error('Invalid historical archive contract');
  for(const c of ['etsy','noths']){
    const ch=archive.channels?.[c],rows=ch?.daily;
    if(!rows?.length||ch.coverage.start!==rows[0].date||ch.coverage.end!==rows.at(-1).date||F.next(ch.coverage.end)!==boundaries[c])throw Error('Invalid historical boundary');
    let day=ch.coverage.start;
    for(const row of rows){if(row.date!==day||row.completeness!==CONFIDENCE||Object.keys(row).some(k=>!['date','completeness',...A.FIELDS[c]].includes(k))||A.FIELDS[c].some(k=>!Number.isSafeInteger(row[k]))||row.orders<0)throw Error('Invalid historical day or privacy shape');day=F.next(day);}
    if(rows.reduce((n,r)=>n+r.orders,0)!==ch.audit.source_orders-ch.audit.excluded_orders)throw Error('Historical order counts do not reconcile');
    const monthly=new Map(ch.months.map(m=>[m.month,m]));
    if(monthly.size!==ch.months.length)throw Error('Duplicate historical month');
    for(const month of new Set(rows.map(r=>r.date.slice(0,7)))){
      const group=rows.filter(r=>r.date.startsWith(month)),m=monthly.get(month);
      if(!m||m.start!==group[0].date||m.end!==group.at(-1).date||A.FIELDS[c].some(k=>group.reduce((n,r)=>n+r[k],0)!==m[k]))throw Error('Historical monthly components do not reconcile');
    }
  }
  return archive;
}
function publish(archive,{repo=ROOT,out,cache}={}) {
  const p=paths({repo,out,cache});
  validate(archive,liveBoundaries(p.repo));
  const bytes=JSON.stringify(archive,null,2)+'\n',sha=require('node:crypto').createHash('sha256').update(bytes).digest('hex'),file='snapshots/'+sha+'.json';
  fs.mkdirSync(path.join(p.out,'snapshots'),{recursive:true});
  const target=path.join(p.out,file);if(!fs.existsSync(target))fs.writeFileSync(target,bytes,{flag:'wx',mode:0o644});
  atomic(path.join(p.out,'manifest.json'),{schema:archive.schema,historical:true,file,sha256:sha},0o644);
  return {sha256:sha,file};
}
async function run({repo=ROOT,env=process.env,cache,out,force=false,channels=['etsy','noths'],discovery:givenDiscovery,readerFactory=H.reader,discoverFn=discover,credentialsFn=async(e,c)=>c==='etsy'?Source.credentials(e):e,onProgress=()=>{},publishArchive=true}={}) {
  const p=paths({repo,cache,out}),boundaries=liveBoundaries(p.repo),results={};
  fs.mkdirSync(p.cache,{recursive:true,mode:0o700});
  const proofFile=path.join(p.cache,'discovery.json');
  let discovery=givenDiscovery||(!force&&fs.existsSync(proofFile)?JSON.parse(fs.readFileSync(proofFile)):{});
  for(const c of channels)if(!discovery[c])discovery[c]=await discoverFn(c,env);
  atomic(proofFile,discovery);
  for(const channel of channels){
    const start=discovery[channel]?.earliest_day,end=previous(boundaries[channel]);F.day(start);
    const ranges=chunks(start,end,channel==='noths'?'month':'year'),reader=readerFactory({env});
    const parts=[],seenOrders=new Set();let cursor=0;
    for(const range of ranges){
      const file=path.join(p.cache,checkpointName(channel,range));
      let result=!force?readCheckpoint(file,range,channel,cursor,boundaries[channel]):null;
      const skipped=!!result;
      if(!result){
        for(let attempt=0;;attempt++){
          try{result=await reader.capture({channel,...range,initialOffset:channel==='noths'?cursor:0,credentials:await credentialsFn(env,channel)});break;}
          catch(error){reader.clear();if(attempt>=2||!/source count changed|source connection|HTTP (429|5\d\d)|fetch failed|timed out|aborted/i.test(error.message))throw error;onProgress({channel,...range,status:'retry',attempt:attempt+1});}
        }
        result={...result,...range};
      }
      for(const row of result.capture.rows){const id=String(channel==='etsy'?row.receipt_id:row.id);if(seenOrders.has(id))throw Error('Native order duplicated across historical chunks');seenOrders.add(id);}
      if(!skipped)saveCheckpoint(file,result,range,boundaries[channel]);
      if(channel==='noths')cursor=result.resume_offset;
      parts.push({...range,derived:result.derived,capture:{count:result.capture.count,pages:result.capture.pages},source_sha256:H.hash(result.capture),initial_offset:result.initial_offset,resume_offset:result.resume_offset,audit:result.audit});
      onProgress({channel,...range,status:skipped?'cached':'captured',orders:result.capture.count,pages:result.capture.pages,mapped_native_gbp:result.audit?.native_gbp_mapped_orders||0});
    }
    results[channel]=parts;
  }
  if(!publishArchive)return {results,boundaries,discovery};
  const archive=compose(results,boundaries,discovery),publication=publish(archive,{...p});
  return {archive,publication,boundaries,discovery};
}
module.exports={ROOT,VERSION,CONFIDENCE,previous,chunks,paths,rejectLive,atomic,liveBoundaries,checkpointName,saveCheckpoint,readCheckpoint,compose,validate,publish,run,discover};
