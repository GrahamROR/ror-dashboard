// Read-only evidence in; private candidate out. Never mutates the supplied export.
'use strict';
const assert=require('node:assert/strict');
function stage(existing,rows,channel,start,end){
 assert.ok(['meta','google'].includes(channel));
 const days=structuredClone(existing.days||{}),seen=new Set();let added=0;
 for(const row of rows){
  assert.match(row.date,/^\d{4}-\d{2}-\d{2}$/);assert.ok(row.date>=start&&row.date<=end);
  assert.ok(!seen.has(row.date),'Duplicate source day');seen.add(row.date);
  for(const k of ['spend','conversions','conversionValue'])assert.ok(typeof row[k]==='number'&&Number.isFinite(row[k]),'Missing source '+k);
  if(days[row.date]?.[channel]?.spend!=null)continue;
  days[row.date]={...days[row.date],[channel]:{spend:row.spend,conversions:row.conversions,conversionValue:row.conversionValue,clicks:row.clicks??null,impressions:row.impressions??null,source:row.source}};added++;
 }
 return {candidate:{...existing,days},added,missingEvidence:enumerate(start,end).filter(d=>!seen.has(d))};
}
function enumerate(start,end){const out=[];for(let d=start;d<=end;){out.push(d);const n=new Date(d+'T00:00:00Z');n.setUTCDate(n.getUTCDate()+1);d=n.toISOString().slice(0,10);}return out;}
module.exports={stage};
