// Historical comparison presentation; original source arithmetic and live trust gates stay unchanged.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./reporting'),require('../../dashboard2/calculations'));else root.RorHistoricalComparison=factory(root.RorHistoricalFinance,root.RorCalc);})(typeof window==='undefined'?globalThis:window,function(H,C){
'use strict';
const REVENUE_BASES=new Set(['net_revenue','workbook-recorded-revenue']);
function knownBasis(part){return REVENUE_BASES.has(part?.basis)&&!(part.confidence==='self-reported'&&part.basis!=='workbook-recorded-revenue')?part.basis:null;}
function countBasis(part,channel){
 if(!knownBasis(part))return null;
 if(part.basis==='workbook-recorded-revenue')return channel==='shopify'?'workbook-recorded-orders':null;
 return ({shopify:'shopify-native-eligible-orders',etsy:'etsy-native-eligible-receipts',noths:'noths-placed-order-cohort',all:'combined-native-source-counts'})[channel]||null;
}
function completeFor(part,metric){
 if(part?.missing_days>0)return false;
 if(metric==='orders'&&part?.ordersStatus)return part.ordersStatus==='complete';
 if(part?.status==='complete')return true;
 // A full workbook month can record an order count even when its revenue field is null.
 return metric==='orders'&&part?.status==='unavailable'&&part.basis==='workbook-recorded-revenue'&&part.confidence==='self-reported'&&part.value===null&&Number.isSafeInteger(part.orders)&&part.orders>=0;
}
function blocked(note,status='incomplete-data'){return {status,current:null,previous:null,absoluteChange:null,percentChange:null,note};}
function compareParts(current,previous,{metric='revenue',channel}={}){
 if(!['revenue','orders'].includes(metric))throw Error('Unsupported historical comparison metric');
 const key=p=>metric==='orders'?countBasis(p,channel):knownBasis(p);
 // Period summaries supply confidence arrays; individual month parts supply one confidence.
 const a=key(current),b=key(previous),provenance={currentConfidence:current?.confidences||current?.confidence,previousConfidence:previous?.confidences||previous?.confidence};
 if(!a||!b)return {...blocked('A complete source with a known comparison basis is required.'),...provenance};
 if(a!==b)return {...blocked('Source definitions differ: workbook figures and native Net Sales / eligible orders cannot be compared.','incompatible-basis'),...provenance};
 const scale=metric==='revenue'?100:1,raw=p=>p?.[metric==='revenue'?'value':'orders'];
 const numeric=p=>{const v=raw(p),n=metric==='revenue'?Math.round(v*scale):v;return Number.isFinite(v)&&Number.isSafeInteger(n)&&(metric==='revenue'||n>=0)?n:null;};
 const shape=p=>({status:completeFor(p,metric)?'complete':'incomplete-data',financialBasis:key(p),[metric]:numeric(p)});
 const result=C.compareAggregates(shape(current),shape(previous),metric);
 return {...result,current:result.current==null?null:result.current/scale,previous:result.previous==null?null:result.previous/scale,absoluteChange:result.absoluteChange==null?null:result.absoluteChange/scale,basis:a,...provenance};
}
function shiftMonth(period,offset){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||!Number.isSafeInteger(offset))throw Error('Invalid historical comparison month');
 const date=new Date(period+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+offset);return date.toISOString().slice(0,7);
}
function monthComparison(context,row,channel,mode='previous-year',metric='revenue'){
 if(mode==='none')return blocked('Comparison is off.','off');
 if(!['previous-year','previous-period'].includes(mode))throw Error('Unknown historical comparison');
 const period=shiftMonth(row.period,mode==='previous-year'?-12:-1);
 if(row.partial_period)return {...blocked('Growth comparisons require full calendar months.'),previous_period:period,currentConfidence:row[channel]?.confidence};
 const previous=context.month(period);
 if(previous.partial_period)return {...blocked('The previous month is incomplete; growth is unavailable.'),previous_period:period,currentConfidence:row[channel]?.confidence,previousConfidence:previous[channel]?.confidence};
 return {...compareParts(row[channel],previous[channel],{metric,channel}),previous_period:period};
}
function monthCount(range){return (+range.endDate.slice(0,4)-+range.startDate.slice(0,4))*12+(+range.endDate.slice(5,7)-+range.startDate.slice(5,7))+1;}
function summary(context,rows,range,channel){
 const expected=monthCount(range),spanComplete=rows.length===expected&&rows[0]?.start===range.startDate&&rows.at(-1)?.end===range.endDate&&rows.every(r=>!r.partial_period);
 const bases=[...new Set(rows.map(r=>knownBasis(r[channel])).filter(Boolean))];
 if(!bases.length)bases.push(channel==='shopify'&&range.startDate<context.boundaries.shopify?'workbook-recorded-revenue':'net_revenue');
 const mixed=bases.length>1,hasKnownBasis=rows.some(r=>knownBasis(r[channel]));
 const groups=bases.map(basis=>{
  const entries=mixed?rows.filter(r=>knownBasis(r[channel])===basis):rows;
  const money=entries.filter(r=>knownBasis(r[channel])===basis&&Number.isFinite(r[channel]?.value));
  const counted=entries.filter(r=>knownBasis(r[channel])===basis&&Number.isSafeInteger(r[channel]?.orders)&&r[channel].orders>=0);
  const cents=money.reduce((n,r)=>n+Math.round(r[channel].value*100),0),orders=counted.reduce((n,r)=>n+r[channel].orders,0);
  const subtotal=money.length&&Number.isSafeInteger(cents)?cents/100:null,orderSubtotal=counted.length&&Number.isSafeInteger(orders)?orders:null;
  const full=!mixed&&spanComplete&&money.length===expected&&entries.every(r=>r[channel]?.status==='complete')&&subtotal!=null;
  const orderFull=!mixed&&spanComplete&&counted.length===expected&&orderSubtotal!=null&&entries.every(r=>completeFor(r[channel],'orders'));
  const confidences=[...new Set(money.concat(counted).map(r=>r[channel].confidence).filter(Boolean))];
  return {basis,subtotal,orderSubtotal,full,orderFull,knownMonths:money.length,countedMonths:counted.length,expectedMonths:mixed?entries.length:expected,completeMonths:entries.filter(r=>r[channel]?.status==='complete'&&!r.partial_period).length,confidences,
   part:{basis,value:full?subtotal:null,orders:orderFull?orderSubtotal:null,status:full?'complete':'partial-source',ordersStatus:orderFull?'complete':'incomplete-data',confidences}};
 });
 return {channel,groups,mixed,hasKnownBasis,spanComplete,expectedMonths:expected,knownMonths:groups.reduce((n,g)=>n+g.knownMonths,0),completeMonths:groups.reduce((n,g)=>n+g.completeMonths,0),part:mixed?{status:'incomplete-data',basis:null,value:null,orders:null}:groups[0].part};
}
function analyse(context,range,channels,mode='previous-year',metric='revenue'){
 if(!['previous-year','previous-period','none'].includes(mode)||!['revenue','orders'].includes(metric))throw Error('Unsupported historical view');
 if(!Array.isArray(channels)||!channels.length||new Set(channels).size!==channels.length||channels.some(c=>!['shopify','etsy','noths'].includes(c)))throw Error('Unsupported historical stores');
 const allStores=channels.length===3;
 const rows=H.rangeRows(context,range),cache=new Map(rows.filter(r=>!r.partial_period).map(r=>[r.period,r]));
 const cached={...context,month:period=>{if(!cache.has(period))cache.set(period,context.month(period));return cache.get(period);}};
 const wholeMonths=range.startDate.endsWith('-01')&&range.endDate===H.monthEnd(range.endDate.slice(0,7));
 const n=monthCount(range);let previousRange=null,previousRows=[];
 if(mode!=='none'&&wholeMonths&&n===rows.length){
  const offset=mode==='previous-year'?-12:-n;
  previousRange={startDate:shiftMonth(range.startDate.slice(0,7),offset)+'-01',endDate:H.monthEnd(shiftMonth(range.endDate.slice(0,7),offset))};
  previousRows=H.rangeRows(cached,previousRange);
 }
 const reportChannels=[...channels,...(allStores?['all']:[])],summaries={};
 for(const channel of reportChannels){
  const current=summary(context,rows,range,channel),previous=previousRange?summary(context,previousRows,previousRange,channel):null;
  current.comparisons={};
  for(const m of ['revenue','orders'])current.comparisons[m]=mode==='none'?blocked('Comparison is off.','off'):!previous?blocked('Whole-period growth requires full calendar months and complete matching coverage.'):current.mixed||previous.mixed?blocked('The selected period spans recorded revenue and Net Sales. Compare compatible individual months below.','incompatible-basis'):compareParts(current.part,previous.part,{metric:m,channel});
  for(const m of ['revenue','orders'])current.comparisons[m]={...current.comparisons[m],currentConfidence:[...new Set(current.groups.flatMap(g=>g.confidences))],previousConfidence:previous?[...new Set(previous.groups.flatMap(g=>g.confidences))]:[]};
  summaries[channel]=current;
 }
 const points=rows.map(row=>({...row,comparisons:Object.fromEntries(reportChannels.map(channel=>[channel,monthComparison(cached,row,channel,mode,metric)]))}));
 const series=channels.flatMap(channel=>summaries[channel].groups.map(group=>({channel,basis:group.basis,key:channel+':'+group.basis,points:points.map(row=>{
  const p=row[channel],cmp=row.comparisons[channel],raw=p?.[metric==='revenue'?'value':'orders'];
  const valid=!row.partial_period&&completeFor(p,metric)&&knownBasis(p)===group.basis&&Number.isFinite(raw)&&(metric!=='orders'||Number.isSafeInteger(raw)&&raw>=0);
  const comparable=valid&&['ok','zero-denominator'].includes(cmp.status);
  return {period:row.period,value:valid?raw:null,previous:comparable?cmp.previous:null,status:valid?'complete':'incomplete-data',note:row.partial_period?'Charts compare full months; selected partial amounts remain in the table.':p?.reason||'Complete monthly source coverage is required.',comparison:cmp};
 })})));
 return {rows:points,summaries,series,previousRange,metric,mode,negativeChartValues:series.some(s=>s.points.some(p=>p.value<0||p.previous<0)),showCombined:allStores&&rows.some(r=>r.all.value!=null)};
}
return {compareParts,countBasis,shiftMonth,monthComparison,analyse};
});
