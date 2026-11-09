'use strict';
const fs=require('node:fs'),path=require('node:path');
function derive(input,liveStart){
 require('../contract').day(liveStart);
 for(const row of input.records||[])if(row.channel==='shopify'&&(!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)||(row.currency!=null&&row.currency!=='GBP')))throw Error('Invalid legacy month or currency');
 const months=(input.records||[]).filter(r=>r.channel==='shopify').filter(r=>new Date(Date.UTC(+r.period.slice(0,4),+r.period.slice(5,7),0)).toISOString().slice(0,10)<liveStart).map(r=>({period:r.period,revenue:r.revenue,orders:r.orders})).sort((a,b)=>a.period.localeCompare(b.period));
 if(!months.length||new Set(months.map(r=>r.period)).size!==months.length)throw Error('Legacy Shopify months missing or duplicated');
 for(const row of months)if((row.revenue!==null&&(!Number.isFinite(row.revenue)||Math.abs(row.revenue*100-Math.round(row.revenue*100))>1e-6))||(row.orders!==null&&(!Number.isSafeInteger(row.orders)||row.orders<0)))throw Error('Invalid legacy monthly aggregate');
 return {schema:'shopify-legacy-monthly-v1',source:'spreadsheet-import',confidence:'self-reported',basis:'workbook-recorded-revenue',grain:'monthly',currency:'GBP',live_start_at_capture:liveStart,coverage:{start:months[0].period,end:months.at(-1).period},months};
}
function readPrivate({repo=path.resolve(__dirname,'../..'),input=path.join(repo,'local-data/dashboard2-real-data.json')}={}){
 const manifest=JSON.parse(fs.readFileSync(path.join(repo,'finance/staging/manifest.json')));
 if(!/^snapshots\/[a-f0-9]{64}\.json$/.test(manifest.file))throw Error('Invalid live Shopify manifest');
 const bytes=fs.readFileSync(path.join(repo,'finance/staging',manifest.file));
 if(require('node:crypto').createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Live Shopify boundary integrity failed');
 const snapshot=JSON.parse(bytes);return derive(JSON.parse(fs.readFileSync(input)),snapshot.coverage.start);
}
function importPrivate({repo=path.resolve(__dirname,'../..'),input=path.join(repo,'local-data/dashboard2-real-data.json'),out=path.join(repo,'finance/historical/shopify-legacy.json')}={}){
 if(path.resolve(out)!==path.join(repo,'finance/historical/shopify-legacy.json'))throw Error('Legacy output must use its separate aggregate path');
 const B=require('../marketplaces/historical-backfill');B.rejectLive(out,repo);
 const result=readPrivate({repo,input});B.atomic(out,result,0o644);return result;
}
module.exports={derive,readPrivate,importPrivate};
