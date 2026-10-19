// Optional organic-content What-If estimate. Never changes financial or attribution records.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ContentGoalPlan=factory();})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
function calculate({sessions,baseline,share,views,rate,days}={}){
 const missing=reason=>({status:'missing',posts:null,additional:null,instagram:null,reason});
 if(!Number.isFinite(sessions)||sessions<0)return missing('Session requirement unavailable');
 if(!Number.isFinite(baseline)||baseline<0)return missing('Enter expected website visits');
 if(!Number.isFinite(share)||share<0||share>1)return missing('Set Instagram share (0–100%)');
 const additional=Math.max(0,sessions-baseline),instagram=additional*share;
 if(instagram===0)return {status:'estimate',posts:0,additional,instagram,reason:'No additional Instagram sessions allocated'};
 if(days===0)return missing('Period ended');
 if(!Number.isFinite(views)||views<=0)return missing('Enter average views per post');
 if(!Number.isFinite(rate)||rate<=0||rate>1)return missing('Enter views that become visits (%)');
 const raw=instagram/(views*rate);
 if(!Number.isFinite(raw)||raw>Number.MAX_SAFE_INTEGER)return missing('Assumptions exceed supported range');
 return {status:'estimate',posts:Math.ceil(raw),additional,instagram,sessionsPerPost:views*rate,reason:'Planning estimate, not attributed sales'};
}
// Same calendar window last year; monthly sources allow proportional estimates only.
function historicalBaseline({start,end,years}={}){
 const missing=reason=>({sessions:null,status:'missing',reason});
 const valid=s=>{const d=new Date(s+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;};
 if(!valid(start)||!valid(end)||start>end)return missing('No remaining planning days');
 const shiftYear=s=>{const y=+s.slice(0,4)-1,m=+s.slice(5,7),last=new Date(Date.UTC(y,m,0)).getUTCDate();return y+'-'+s.slice(5,8)+String(Math.min(+s.slice(8),last)).padStart(2,'0');};
 const a=shiftYear(start),b=shiftYear(end),rows=Object.values(years||{}).flatMap(y=>y.monthly||[]);let total=0;
 for(let key=a.slice(0,7);key<=b.slice(0,7);){
  const matches=rows.filter(m=>m.key===key);
  if(matches.length!==1||matches[0].complete!==true||matches[0].future||!Number.isFinite(matches[0].sessions)||matches[0].sessions<0)return missing('Complete last-year session history unavailable');
  const days=new Date(Date.UTC(+key.slice(0,4),+key.slice(5),0)).getUTCDate(),first=key===a.slice(0,7)?+a.slice(8):1,last=key===b.slice(0,7)?+b.slice(8):days;
  total+=matches[0].sessions*(last-first+1)/days;
  key=new Date(Date.UTC(+key.slice(0,4),+key.slice(5),1)).toISOString().slice(0,7);
 }
 return {sessions:Math.round(total),status:'estimate',start:a,end:b,reason:'Last-year Shopify traffic; partial months prorated. Includes existing marketing, not a guaranteed forecast.'};
}
return {calculate,historicalBaseline};
});
