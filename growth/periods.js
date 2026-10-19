// Local goal-period planning only: no changes to financial sources or approved annual goals.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./targets'));else root.GrowthGoalPeriods=factory(root.GrowthTargets);})(typeof window==='undefined'?globalThis:window,function(T){
'use strict';
const DAY=86400000;
function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw Error('Choose valid start and end dates.');const d=new Date(s+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s)throw Error('Choose valid start and end dates.');return d;}
const shift=(s,n)=>new Date(+date(s)+n*DAY).toISOString().slice(0,10);
function bounds(fy){if(!/^FY\d{2}$/.test(fy))throw Error('Choose a financial year.');const y=2000+Number(fy.slice(2));return {start:`${y-1}-08-01`,end:`${y}-07-31`};}
const endMonth=key=>key+'-'+String(T.monthDays(key)).padStart(2,'0');
function choices(fy){const b=bounds(fy),months=T.plan(0,fy,null).months,rows=[{key:'annual',label:'Full financial year',...b}];
 for(let y=+b.start.slice(0,4);y<=+b.end.slice(0,4);y++)for(let q=1;q<=4;q++){const start=`${y}-${String((q-1)*3+1).padStart(2,'0')}-01`,end=endMonth(`${y}-${String(q*3).padStart(2,'0')}`);if(start>=b.start&&end<=b.end)rows.push({key:`calendar-${y}-Q${q}`,label:`Calendar Q${q} ${y}`,start,end});}
 for(let i=0;i<4;i++)rows.push({key:'financial-Q'+(i+1),label:`${fy} financial Q${i+1} (${months[i*3].key} – ${months[i*3+2].key})`,start:months[i*3].key+'-01',end:endMonth(months[i*3+2].key)});
 for(const m of months)rows.push({key:'month-'+m.key,label:date(m.key+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}),start:m.key+'-01',end:endMonth(m.key)});
 return rows;
}
function resolve(fy,key,custom={}){const b=bounds(fy),r=key==='custom'?{key,label:'Custom period',start:custom.start,end:custom.end}:choices(fy).find(r=>r.key===key);if(!r)throw Error('Choose a period in the selected financial year.');date(r.start);date(r.end);if(r.start>r.end)throw Error('Start date must be before end date.');if(r.start<b.start||r.end>b.end)throw Error(`Keep dates within ${fy} (${b.start} to ${b.end}), or change the financial year above.`);return r;}
function allocation(goal,fy,start,end){date(start);date(end);if(start>end)return {amount:0,days:0,months:0};let cents=0,days=0,months=0;for(const m of T.plan(goal,fy,null).months){const a=start>m.key+'-01'?start:m.key+'-01',b=end<endMonth(m.key)?end:endMonth(m.key);if(a>b)continue;const first=+a.slice(8),last=+b.slice(8),n=last-first+1,pennies=Math.round(m.fullTarget*100);cents+=Math.round(pennies*last/m.days)-Math.round(pennies*(first-1)/m.days);days+=n;months+=n/m.days;}return {amount:cents/100,days,months};}
function calculate(goal,fy,period,finance={},assumptions={},mode='plan'){
 if(!['plan','remaining'].includes(mode))throw Error('Unknown planning mode');
 const p=resolve(fy,period.key,period),full=allocation(goal,fy,p.start,p.end);
 let cutoff=finance.cutoff||null;if(cutoff){date(cutoff);cutoff=cutoff>p.end?p.end:cutoff;}
 const verified=finance.status==='actual'&&Number.isFinite(finance.revenue)&&cutoff&&cutoff>=p.start;
 const future=finance.status==='future';
 const actual=verified?finance.revenue:null,expected=verified?allocation(goal,fy,p.start,cutoff).amount:null;
 const remaining=verified?Math.max(0,T.variance(full.amount,actual)):future?full.amount:null;
 const remainingStart=verified?shift(cutoff,1):future?p.start:null,remainingAllocation=remainingStart?allocation(goal,fy,remainingStart,p.end):null;
 const amount=mode==='plan'?full.amount:remaining,days=mode==='plan'?full.days:remainingAllocation?.days??null,months=mode==='plan'?full.months:remainingAllocation?.months??null;
 const rate=n=>amount!=null&&n>0?amount/n:null,aov=assumptions.aov,cvr=assumptions.cvr;
 const orders=amount!=null&&Number.isFinite(aov)&&aov>0?amount/aov:null,sessions=orders!=null&&Number.isFinite(cvr)&&cvr>0&&cvr<=1?orders/cvr:null;
 return {...p,target:full.amount,actual,cutoff:verified?cutoff:null,expected,variance:T.variance(actual,expected),remaining,amount,days,months,monthly:rate(months),weekly:rate(days)==null?null:rate(days)*7,daily:rate(days),orders,sessions,ordersDaily:orders!=null&&days>0?orders/days:null,sessionsDaily:sessions!=null&&days>0?sessions/days:null,status:verified?'actual':future?'future':'missing',ended:days===0};
}
return {bounds,choices,resolve,allocation,calculate};
});
