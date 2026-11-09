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
  return current.value==null?absent('Native Shopify coverage unavailable.'): {value:current.value/100,orders:current.orders,status:'complete',confidence:current.confidence,basis:'net_revenue'};
 }
 function month(period){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw Error('Invalid historical month');
  const start=period+'-01',end=monthEnd(period)<through?monthEnd(period):through;
  if(start>through)return {period,start,end,partial_period:false,shopify:absent('Future period.'),etsy:absent('Future period.'),noths:absent('Future period.'),all:absent('Future period.')};
  const parts={shopify:shopify(period,start,end),etsy:marketplace('etsy',start,end),noths:marketplace('noths',start,end)};
  const complete=Object.values(parts).every(p=>p.status==='complete'&&p.value!=null&&p.orders!=null&&p.basis==='net_revenue');
  const all=complete?{value:Math.round(Object.values(parts).reduce((n,p)=>n+Math.round(p.value*100),0))/100,orders:Object.values(parts).every(p=>p.orders!=null)?Object.values(parts).reduce((n,p)=>n+p.orders,0):null,status:'complete',basis:'net_revenue',confidence:Object.values(parts).some(p=>p.confidence===HIST)?HIST:'provisional'}:absent(parts.shopify.basis==='workbook-recorded-revenue'?'Workbook revenue has no confirmed Net Sales basis; it is kept separate.':'Complete matching source coverage is required.');
  return {period,start,end,partial_period:end<monthEnd(period),...parts,all};
 }
 const earliest=[legacy.coverage.start,...Object.values(archive.channels).map(c=>c.coverage.start),shopStart].sort()[0];
 return {month,through,earliest,years:Array.from({length:+through.slice(0,4)-+earliest.slice(0,4)+1},(_,i)=>String(+earliest.slice(0,4)+i)),default_year:legacy.coverage.start.slice(0,4),boundaries:{shopify:shopStart,etsy:channels.etsy.boundary,noths:channels.noths.boundary}};
}
return {prepare,HIST,monthEnd};
});
