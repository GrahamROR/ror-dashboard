// Descriptive pace only. Shared target maths; no source values or verdicts are changed.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./targets'));else root.GrowthRunRate=factory(root.GrowthTargets);})(typeof window==='undefined'?globalThis:window,function(T){
'use strict';
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function sessions({fy,value,updated,coverage,months}){
 const empty={perDay:null,elapsedDays:0,through:null,partial:false};
 if(!/^FY\d{2}$/.test(fy)||!finite(value)||value<0)return empty;
 const year=2000+Number(fy.slice(2)),start=`${year-1}-08-01`,close=`${year}-07-31`;
 let capture;try{if(!updated||!Number.isFinite(Date.parse(updated)))return empty;capture=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(updated));}catch{return empty;}
 const aligned=coverage?.status==='complete'&&coverage.timezone==='Europe/London'&&coverage.start===start&&/^\d{4}-\d{2}-\d{2}$/.test(coverage.end)&&coverage.end<=capture;
 const through=(aligned?coverage.end:capture)<close?(aligned?coverage.end:capture):close;
 let plan;try{plan=T.plan(1,fy,through);}catch{return empty;}
 const elapsed=plan.months.reduce((n,m)=>n+m.elapsedDays,0);
 if(!elapsed)return empty;
 if(months){const selected=plan.months.filter(m=>m.elapsedDays>0).map(m=>months.find(r=>r.key===m.key));if(selected.some(m=>!finite(m?.sessions)||m.sessions<0)||selected.reduce((n,m)=>n+m.sessions,0)!==value)return empty;}
 return {perDay:value/elapsed,elapsedDays:elapsed,through,partial:!aligned&&capture<=close};
}
function month({actual,target,elapsedDays,days,complete}){
 const empty={actualPerDay:null,neededPerDay:null,projection:null,remainingDays:null};
 if(!complete||!finite(actual)||!finite(target)||target<0||!Number.isInteger(elapsedDays)||!Number.isInteger(days)||elapsedDays<=0||elapsedDays>days)return empty;
 const remainingDays=days-elapsedDays,actualPerDay=actual/elapsedDays;
 return {actualPerDay,neededPerDay:remainingDays>0?Math.max(0,target-actual)/remainingDays:null,projection:actualPerDay*days,remainingDays};
}
return {sessions,month};
});
