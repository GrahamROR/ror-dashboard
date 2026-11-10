// Separate monthly archive reporting. Never promotes historical rows into the live contract.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../management'),require('../contract'));else root.RorHistoricalFinance=factory(root.ManagementFinance,root.ShopifyFinance);})(typeof window==='undefined'?globalThis:window,function(M,F){
'use strict';
const HIST='historical-api-backfill';
function monthEnd(period){return new Date(Date.UTC(+period.slice(0,4),+period.slice(5,7),0)).toISOString().slice(0,10);}
function absent(reason){return {value:null,orders:null,status:'unavailable',confidence:'unavailable',reason};}
function prepare({archive,legacy,shop,markets,through}){
 F.day(through);
 if(archive?.historical!==true||archive.validated!==false||archive.confidence!==HIST||archive.schema!=='marketplace-sales-v1'||archive.currency!=='GBP'||archive.timezone!=='Europe/London')throw Error('Historical archive contract unavailable');
 if(legacy?.schema!=='shopify-legacy-monthly-v1'||legacy.grain!=='monthly'||legacy.currency!=='GBP'||legacy.confidence!=='self-reported'||legacy.basis!=='workbook-recorded-revenue')throw Error('Legacy monthly source contract unavailable');
 const shopStart=shop?.coverage?.start;F.day(shopStart);
 const legacyByMonth=new Map();
 for(const row of legacy.months){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)||monthEnd(row.period)>=shopStart||legacyByMonth.has(row.period)||Object.keys(row).some(k=>!['period','revenue','orders'].includes(k))||(row.revenue!==null&&!Number.isFinite(row.revenue))||(row.orders!==null&&(!Number.isSafeInteger(row.orders)||row.orders<0)))throw Error('Legacy monthly overlap or invalid aggregate');
  legacyByMonth.set(row.period,row);
 }
 const channels={};
 for(const c of ['etsy','noths']){
  const history=archive.channels?.[c]?.daily,live=markets?.channels?.[c]?.daily;
  if(!history?.length||!live?.length)throw Error('Historical or live source boundaries unavailable');
  const boundary=live[0].date;F.day(boundary);
  if(history.at(-1).date>=boundary)throw Error('Historical and live source dates overlap');
  const rows=[],byDay=new Map();
  for(const[set,label]of[[history,HIST],[live,'validated']])for(const row of set){
   F.day(row.date);
   const fields=c==='etsy'?['net_sales','shipping','orders']:['customer_total','orders'];
   if(row.completeness!==label||fields.some(k=>!Number.isSafeInteger(row[k]))||row.orders<0||byDay.has(row.date))throw Error('Invalid or duplicate historical source day');
   const copy={...row,historical:label===HIST};rows.push(copy);byDay.set(copy.date,copy);
  }
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  channels[c]={rows,byDay,allocation:M.allocatedVAT(rows,c),boundary};
 }
 function marketplace(c,start,end){
  const source=channels[c],selected=[];let missing=0;
  for(let day=start;day<=end;day=F.next(day)){const row=source.byDay.get(day);if(row)selected.push(row);else missing++;}
  if(!selected.length)return absent('No source data for this period.');
  const hasHistory=selected.some(r=>r.historical);
  return {value:selected.reduce((n,r)=>n+source.allocation.get(r.date),0)/100,orders:selected.reduce((n,r)=>n+r.orders,0),status:missing?'partial-source':'complete',confidence:hasHistory?HIST:'provisional',basis:'net_revenue',covered_start:selected[0].date,covered_end:selected.at(-1).date,missing_days:missing};
 }
 function shopify(period,start,end){
  const old=legacyByMonth.get(period);
  if(old){if(start!==period+'-01'||end!==monthEnd(period))return absent('Workbook supports full months only.');return {value:old.revenue,orders:old.orders,status:old.revenue==null?'unavailable':'complete',confidence:'self-reported',basis:'workbook-recorded-revenue'};}
  const current=M.shopify(shop,start,end,'net_revenue');
  return current.value==null?absent('No Shopify source data for this period.'): {value:current.value/100,orders:current.orders,status:'complete',confidence:current.confidence,basis:'net_revenue'};
 }
 // Explicit reporting access for native-compatible comparison baselines only.
 // Workbook months never become daily Net Sales, and missing days are never clipped.
 function select(selectedChannels,start,end){
  F.day(start);F.day(end);
  if(start>end||!selectedChannels.length||new Set(selectedChannels).size!==selectedChannels.length||selectedChannels.some(c=>!['shopify','etsy','noths'].includes(c)))throw Error('Invalid historical comparison range');
  const parts=selectedChannels.map(channel=>{
   const part=channel==='shopify'?(start<shopStart?absent('Workbook revenue / orders have a different source basis; native comparison unavailable.'):shopify(start.slice(0,7),start,end)):marketplace(channel,start,end);
   return {channel,...part};
  });
  const complete=parts.every(p=>p.status==='complete'&&p.value!=null&&p.basis==='net_revenue');
  const counts=parts.every(p=>p.status==='complete'&&Number.isSafeInteger(p.orders));
  const confidences=[...new Set(parts.map(p=>p.confidence))];
  return {value:complete?parts.reduce((n,p)=>n+Math.round(p.value*100),0)/100:null,orders:counts?parts.reduce((n,p)=>n+p.orders,0):null,status:complete&&counts?'complete':'incomplete-data',ordersStatus:counts?'complete':'incomplete-data',basis:'net_revenue',confidence:complete?(confidences.includes(HIST)?HIST:confidences.includes('provisional')?'provisional':'source-verified'):'unavailable',confidences,parts,note:parts.some(p=>p.confidence===HIST)?'Comparison includes historical API data on the same Net Sales and source-order definitions; marketplace estimates retain their management assumptions.':parts.map(p=>p.reason).filter(Boolean).join(' ')};
 }
 function month(period,range={}){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('Invalid historical month');
  const first=period+'-01',last=monthEnd(period);
  if(range.startDate)F.day(range.startDate);if(range.endDate)F.day(range.endDate);
  const start=[first,range.startDate||first].sort().at(-1),end=[last,through,range.endDate||last].sort()[0];
  if(first>through)return {period,start:first,end:through,partial_period:false,shopify:absent('Future period.'),etsy:absent('Future period.'),noths:absent('Future period.'),all:absent('Future period.')};
  if(start>last||end<first||start>end)return {period,start,end,partial_period:true,shopify:absent('No source days in the selected period.'),etsy:absent('No source days in the selected period.'),noths:absent('No source days in the selected period.'),all:absent('No source days in the selected period.')};
  if(start>through)return {period,start,end,partial_period:false,shopify:absent('Future period.'),etsy:absent('Future period.'),noths:absent('Future period.'),all:absent('Future period.')};
  const parts={shopify:shopify(period,start,end),etsy:marketplace('etsy',start,end),noths:marketplace('noths',start,end)};
  const complete=Object.values(parts).every(p=>p.status==='complete'&&p.value!=null&&p.orders!=null&&p.basis==='net_revenue');
  const all=complete?{value:Math.round(Object.values(parts).reduce((n,p)=>n+Math.round(p.value*100),0))/100,orders:Object.values(parts).every(p=>p.orders!=null)?Object.values(parts).reduce((n,p)=>n+p.orders,0):null,status:'complete',basis:'net_revenue',confidence:Object.values(parts).some(p=>p.confidence===HIST)?HIST:'provisional'}:absent(parts.shopify.basis==='workbook-recorded-revenue'?'Workbook revenue has no confirmed Net Sales basis; it is kept separate.':'Complete matching source coverage is required.');
  return {period,start,end,partial_period:start>first||end<last,...parts,all};
 }
 const legacyStart=legacyByMonth.size?[...legacyByMonth.keys()].sort()[0]+'-01':shopStart;
 const starts={shopify:[legacyStart,shopStart].sort()[0],etsy:channels.etsy.rows[0].date,noths:channels.noths.rows[0].date};
 const earliest=Object.values(starts).sort()[0];
 return {month,select,through,earliest,years:Array.from({length:+through.slice(0,4)-+earliest.slice(0,4)+1},(_,i)=>String(+earliest.slice(0,4)+i)),default_year:legacy.coverage.start.slice(0,4),legacy_start:starts.shopify,starts,boundaries:{shopify:shopStart,etsy:channels.etsy.boundary,noths:channels.noths.boundary}};
}
function fiscalYears(start,end){
 F.day(start);F.day(end);if(start>end)return [];
 const fy=day=>+day.slice(0,4)+(+day.slice(5,7)>=8?1:0);
 return Array.from({length:fy(end)-fy(start)+1},(_,i)=>'FY'+String(fy(start)+i).slice(-2)).reverse();
}
function needsHistory(context,range,channels){return !!context&&!range.unsupported&&channels.some(c=>range.startDate<context.boundaries[c]);}
function rangeRows(context,range){
 F.day(range.startDate);F.day(range.endDate);if(range.startDate>range.endDate)throw Error('Invalid selected historical range');
 const first=[range.startDate,context.earliest.length===7?context.earliest+'-01':context.earliest].sort().at(-1).slice(0,7),last=[range.endDate,context.through].sort()[0].slice(0,7),rows=[];
 for(let period=first;period<=last;){rows.push(context.month(period,range));const d=new Date(period+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);period=d.toISOString().slice(0,7);}
 return rows;
}
return {prepare,HIST,monthEnd,fiscalYears,needsHistory,rangeRows};
});
