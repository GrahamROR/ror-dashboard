// Shopify-only completed-day performance windows. No ROR or Ads data enters this module.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('../finance/contract'),require('../finance/integration'));else root.GrowthPerformance=factory(root.ShopifyFinance,root.ShopifyIntegration);})(typeof window==='undefined'?globalThis:window,function(F,I){
'use strict';
const WINDOWS=Object.freeze([{key:'yesterday',label:'Yesterday',days:1},{key:'last7',label:'Last 7 days',days:7},{key:'last30',label:'Last 30 days',days:30},{key:'last90',label:'Last 90 days',days:90}].map(Object.freeze));
function ranges(through){F.day(through);return WINDOWS.map(w=>({...w,start:F.next(through,1-w.days),end:through}));}
function target(start,end,dailyValue){F.day(start);F.day(end);if(start>end)throw Error('Invalid performance range');let total=0;for(let day=start;day<=end;day=F.next(day)){const month=+day.slice(5,7),idx=(month+4)%12,fy='FY'+String(+day.slice(0,4)+(month>=8?1:0)).slice(-2);const value=dailyValue(day,idx,fy);if(typeof value!=='number'||!Number.isFinite(value))return null;total+=value;}return Math.round(total*100)/100;}
function view({data,snapshot,basis,key='yesterday',through}){
 const range=ranges(through).find(w=>w.key===key);if(!range)throw Error('Unknown performance window');
 const native=I.report(snapshot,range.start,range.end,basis),net=I.report(snapshot,range.start,range.end,'net_revenue');
 const captured=data?.performance?.[key],legacy=key==='yesterday'&&data?.yesterday?.date===range.end?data.yesterday:null;
 const windowAligned=data?.performance?.schema==='shopify-performance-v1'&&data.performance.timezone==='Europe/London'&&data.performance.through===through&&captured?.status==='complete'&&captured.start===range.start&&captured.end===range.end;
 const close=(a,b)=>typeof a==='number'&&Number.isFinite(a)&&typeof b==='number'&&Number.isFinite(b)&&Math.round(a*100)===Math.round(b*100);
 const sourceMatches=windowAligned&&net.status==='actual'&&captured.orders===net.orders&&close(captured.netSales,net.netSales)&&close(captured.revenue,net.totalSales);
 const marketing=sourceMatches?captured:!captured&&legacy?legacy:null;
 const fields=['sessions','convertedSessions','conversionRate','shopifyConversionRate','customers','returning','repeatRate','margin','profit','costCoverage'];
 const result={...range,...native,date:range.end,monthKey:range.end.slice(0,7),netRevenue:net.revenue,aov:sourceMatches?captured.aov:native.aov,marketingAvailable:!!marketing,windowVerified:sourceMatches,captureDate:captured?.end||legacy?.date||null,warning:sourceMatches?null:captured?'Performance source window or native control totals do not match; marketing/cost metrics are withheld.':'Performance capture is unavailable for this window. Financial values still require complete native coverage.'};
 for(const field of fields)result[field]=marketing?.[field]??null;
 return result;
}
return {WINDOWS,ranges,target,view};
});
