(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ShopifyFreshness=factory();})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 function assess(snapshot,status,now=new Date()){
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}),today=fmt.format(now),y=new Date(today+'T00:00:00Z');y.setUTCDate(y.getUTCDate()-1);const expected=y.toISOString().slice(0,10),end=snapshot.coverage.end;
  const prefix='Last verified Shopify financial date: '+end+'. ';
  if(!status||status.snapshot_id!==snapshot.id)return {status:'unknown',warning:prefix+'Refresh status unavailable or inconsistent; snapshot integrity remains verified.'};
  if(!['success','failed','rolled-back'].includes(status.status))return {status:'unknown',warning:prefix+'Financial refresh state is unknown; retained snapshot integrity remains verified.'};
  if(status.status==='failed')return {status:'failed',warning:prefix+'Latest Shopify financial refresh failed; retained verified figures are shown where covered.'};
  if(status.status==='rolled-back')return {status:'rolled-back',warning:prefix+'Financial snapshot rolled back; automatic finance refresh is paused.'};
  if(end<expected){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(now));return {status:hour<8?'pending':'stale',warning:prefix+(hour<8?'Today’s scheduled financial refresh is pending.':'Financial data is stale; expected verified coverage through '+expected+'.')};}
  return {status:'current',warning:null};
 }
 return {assess};
});
