// Scheduled recovery checks are cheap; re-collect only until today's verified bundle is current.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const dateKey=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
function needed(kind,{read=file=>JSON.parse(fs.readFileSync(file,'utf8')),now=new Date()}={}){
 const today=dateKey(now),d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);const yesterday=d.toISOString().slice(0,10);
 const current=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&dateKey(new Date(value))===today;
 try{
  if(kind==='shopify'){
   const base='finance/staging',status=read(base+'/refresh-status.json'),manifest=read(base+'/manifest.json'),snapshot=read(path.posix.join(base,manifest.file)),legacy=read('data.json');
   return !(status.status==='success'&&current(status.completed_at)&&snapshot.coverage.end>=yesterday&&current(legacy.updated));
  }
  if(kind==='marketplaces'){
   const status=read('finance/marketplaces/staging/refresh-status.json');
   return !(status.status==='success'&&current(status.completed_at)&&['etsy','noths'].every(c=>status.source_covered_through?.[c]>=yesterday));
  }
  if(kind==='units'){
   const data=read('dashboard2/sales-data.json');return !(current(data.meta?.generated_at)&&data.meta?.latest>=yesterday);
  }
 }catch{return true;}
 throw Error('Unknown refresh source');
}
if(require.main===module){const value=process.env.GITHUB_EVENT_NAME==='schedule'?needed(process.argv[2]):true;fs.appendFileSync(process.env.GITHUB_OUTPUT,'needed='+value+'\n');console.log(value?'Source refresh required.':'Today’s verified source is current; recovery check only.');}
module.exports={needed,dateKey};
