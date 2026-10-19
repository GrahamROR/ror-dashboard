// Optional organic-content What-If estimate. Never changes financial or attribution records.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ContentGoalPlan=factory();})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
function calculate({sessions,baseline,share,views,rate,days}={}){
 const missing=reason=>({status:'missing',posts:null,additional:null,instagram:null,reason});
 if(!Number.isFinite(sessions)||sessions<0)return missing('Session requirement unavailable');
 if(!Number.isFinite(baseline)||baseline<0)return missing('Enter expected baseline sessions');
 if(!Number.isFinite(share)||share<0||share>1)return missing('Set Instagram share (0–100%)');
 const additional=Math.max(0,sessions-baseline),instagram=additional*share;
 if(instagram===0)return {status:'estimate',posts:0,additional,instagram,reason:'No additional Instagram sessions allocated'};
 if(days===0)return missing('Period ended');
 if(!Number.isFinite(views)||views<=0)return missing('Enter average views per post');
 if(!Number.isFinite(rate)||rate<=0||rate>1)return missing('Set view-to-session rate');
 const raw=instagram/(views*rate);
 if(!Number.isFinite(raw)||raw>Number.MAX_SAFE_INTEGER)return missing('Assumptions exceed supported range');
 return {status:'estimate',posts:Math.ceil(raw),additional,instagram,sessionsPerPost:views*rate,reason:'Planning estimate, not attributed sales'};
}
return {calculate};
});
