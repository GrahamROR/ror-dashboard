// Planning targets only. Never changes Shopify source amounts or definitions.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.GrowthTargets=factory();})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const seasonal = Object.freeze([74,67,60,117,142,106,63,77,56,67,70,61]);
  const sum = seasonal.reduce((a,b)=>a+b,0);
  const normalised = seasonal.map(n=>n/sum);
  normalised[11] = 1-normalised.slice(0,11).reduce((a,b)=>a+b,0);
  const weights = Object.freeze(normalised);
  function allocate(goal){
    const cents=Math.round(goal*100);
    if(!Number.isSafeInteger(cents)||cents<0)throw Error('Invalid annual goal');
    const rows=seasonal.map((n,i)=>({i,cents:Math.floor(cents*n/sum),remainder:(cents*n)%sum}));
    let left=cents-rows.reduce((a,r)=>a+r.cents,0);
    for(const r of [...rows].sort((a,b)=>b.remainder-a.remainder||a.i-b.i)){if(left--<=0)break;r.cents++;}
    return rows.map(r=>r.cents/100);
  }
  function monthDays(key){return new Date(Date.UTC(+key.slice(0,4),+key.slice(5,7),0)).getUTCDate();}
  function plan(goal,fy,cutoff){
    if(!/^FY\d{2}$/.test(fy))throw Error('Invalid financial year');
    if(cutoff!=null&&(!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)||new Date(cutoff+'T00:00:00Z').toISOString().slice(0,10)!==cutoff))throw Error('Invalid reporting cutoff');
    const year=2000+Number(fy.slice(2)),targets=allocate(goal);
    const months=targets.map((fullTarget,i)=>{
      const key=new Date(Date.UTC(year-1,7+i,1)).toISOString().slice(0,7),days=monthDays(key);
      const elapsedDays=cutoff==null?null:cutoff<key+'-01'?0:cutoff.slice(0,7)>key?days:Math.min(days,+cutoff.slice(8));
      return {key,fullTarget,days,elapsedDays,expectedTarget:elapsedDays==null?null:Math.round(Math.round(fullTarget*100)*elapsedDays/days)/100};
    });
    return {annualGoal:Math.round(goal*100)/100,cutoff,months,ytdTarget:cutoff==null?null:months.reduce((n,m)=>n+Math.round(m.expectedTarget*100),0)/100};
  }
  const forFinance = (goal,fy,finance)=>plan(goal,fy,finance?.end===finance?.close ? finance?.close || null : finance?.status==='actual' ? finance.end : null);
  const variance = (totalSales,target)=>totalSales==null||target==null?null:(Math.round(totalSales*100)-Math.round(target*100))/100;
  const signed = n=>n==null?'—':(n<0?'−':n>0?'+':'')+'£'+Math.abs(n).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
  return {weights,allocate,monthDays,plan,forFinance,variance,signed};
});
