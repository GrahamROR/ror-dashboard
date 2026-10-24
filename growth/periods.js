// Local goal-period planning only: no changes to financial sources or approved annual goals.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./targets'));else root.GrowthGoalPeriods=factory(root.GrowthTargets);})(typeof window==='undefined'?globalThis:window,function(T){
'use strict';
const DAY=86400000;
function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw Error('Choose valid start and end dates.');const d=new Date(s+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s)throw Error('Choose valid start and end dates.');return d;}
const shift=(s,n)=>new Date(+date(s)+n*DAY).toISOString().slice(0,10);
function bounds(fy){if(!/^FY\d{2}$/.test(fy))throw Error('Choose a financial year.');const y=2000+Number(fy.slice(2));return {start:`${y-1}-08-01`,end:`${y}-07-31`};}
const endMonth=key=>key+'-'+String(T.monthDays(key)).padStart(2,'0');
function londonDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function fyFor(day){const y=+day.slice(0,4)+(+day.slice(5,7)>=8?1:0);if(y<2000||y>2099)throw Error('Choose a supported financial year.');return 'FY'+String(y).slice(-2);}
function monthShift(day,n){const d=date(day),first=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1)).toISOString().slice(0,7);return first+'-'+String(Math.min(d.getUTCDate(),T.monthDays(first))).padStart(2,'0');}
function quarter(day,offset=0){const d=date(day),month=Math.floor(d.getUTCMonth()/3)*3+offset*3,start=new Date(Date.UTC(d.getUTCFullYear(),month,1)).toISOString().slice(0,10),endKey=new Date(Date.UTC(d.getUTCFullYear(),month+2,1)).toISOString().slice(0,7);return {start,end:endMonth(endKey),label:'Q'+(Math.floor((+start.slice(5,7)-1)/3)+1)+' '+start.slice(0,4)};}
function choices(fy,now=new Date()){const today=londonDay(now),q=quarter(today),n=quarter(today,1);return [
 {key:'annual',label:fy===fyFor(today)?'Current financial year':'Selected financial year ('+fy+')'},
 {key:'previousFY',label:'Previous financial year'},
 {key:'last12Months',label:'Last 12 months (rolling calendar months)'},
 {key:'year2024',label:'Calendar year 2024'},
 {key:'year2025',label:'Calendar year 2025'},
 {key:'year2026YTD',label:'Calendar year 2026 year to date'},
 {key:'thisQuarter',label:'This quarter ('+q.label+')'},
 {key:'nextQuarter',label:'Next quarter ('+n.label+')'},
 {key:'thisMonth',label:'This month'},
 {key:'lastMonth',label:'Last month'},
 {key:'last30',label:'Last 30 days'},
 {key:'last7',label:'Last 7 days'},
 {key:'custom',label:'Custom range'}];}
function resolve(fy,key,custom={},now=new Date()){const b=bounds(fy),today=londonDay(now),yesterday=shift(today,-1);let r={key,label:choices(fy,now).find(p=>p.key===key)?.label};
 if(key==='annual')r={...r,...b};
 else if(key==='previousFY')r={...r,...bounds('FY'+String(+fy.slice(2)-1).padStart(2,'0'))};
 else if(key==='last12Months')r={...r,start:shift(monthShift(yesterday,-12),1),end:yesterday};
 else if(key==='thisQuarter'||key==='nextQuarter')r={...r,...quarter(today,key==='nextQuarter'?1:0)};
 else if(key==='thisMonth')r={...r,start:today.slice(0,7)+'-01',end:endMonth(today.slice(0,7))};
 else if(key==='lastMonth'){const m=monthShift(today.slice(0,7)+'-01',-1).slice(0,7);r={...r,start:m+'-01',end:endMonth(m)};}
 else if(key==='last30'||key==='last7')r={...r,start:shift(yesterday,key==='last30'?-29:-6),end:yesterday};
 else if(key==='year2024'||key==='year2025'){const y=key.slice(4);r={...r,start:y+'-01-01',end:y+'-12-31'};}
 else if(key==='year2026YTD')r={...r,start:'2026-01-01',end:yesterday<'2026-12-31'?yesterday:'2026-12-31'};
 else if(key==='custom')r={...r,start:custom.start,end:custom.end};
 // Retain earlier internal IDs for deterministic calculations; keep these out of the simple menu.
 else if(/^calendar-\d{4}-Q[1-4]$/.test(key)){const [,y,q]=key.split('-'),n=+q.slice(1);r={...r,label:'Calendar Q'+n+' '+y,start:y+'-'+String((n-1)*3+1).padStart(2,'0')+'-01',end:endMonth(y+'-'+String(n*3).padStart(2,'0'))};}
 else if(/^financial-Q[1-4]$/.test(key)){const months=T.plan(0,fy,null).months,i=(+key.slice(-1)-1)*3;r={...r,start:months[i].key+'-01',end:endMonth(months[i+2].key)};}
 else if(/^month-\d{4}-\d{2}$/.test(key)){const m=key.slice(6);r={...r,start:m+'-01',end:endMonth(m)};}
 else throw Error('Choose a valid planning period.');
 date(r.start);date(r.end);if(r.start>r.end)throw Error('Start date must be before end date.');fyFor(r.start);fyFor(r.end);return r;}
function allocation(goal,fy,start,end,budgets={}){date(start);date(end);if(start>end)return {amount:0,days:0,months:0};let cents=0,days=0,months=0;const first=+fyFor(start).slice(2),last=+fyFor(end).slice(2);
 for(let year=first;year<=last;year++){const id='FY'+String(year).padStart(2,'0'),annual=id===fy?goal:budgets[id];if(!Number.isFinite(annual))throw Error('No approved planning goal is available for '+id+'. Choose a supported period.');for(const m of T.plan(annual,id,null).months){const a=start>m.key+'-01'?start:m.key+'-01',b=end<endMonth(m.key)?end:endMonth(m.key);if(a>b)continue;const n=+b.slice(8)-+a.slice(8)+1,pennies=Math.round(m.fullTarget*100);cents+=Math.round(pennies*+b.slice(8)/m.days)-Math.round(pennies*(+a.slice(8)-1)/m.days);days+=n;months+=n/m.days;}}
 return {amount:cents/100,days,months};}
function calculate(goal,fy,period,finance={},assumptions={},mode='plan',budgets={}){
 if(!['plan','remaining'].includes(mode))throw Error('Unknown planning mode');
 const p={...period};date(p.start);date(p.end);if(p.start>p.end)throw Error('Start date must be before end date.');const full=allocation(goal,fy,p.start,p.end,budgets);
 let cutoff=finance.cutoff||null;if(cutoff){date(cutoff);cutoff=cutoff>p.end?p.end:cutoff;}
 const verified=finance.status==='actual'&&Number.isFinite(finance.revenue)&&cutoff&&cutoff>=p.start;
 const future=finance.status==='future';
 const actual=verified?finance.revenue:null,expected=verified?allocation(goal,fy,p.start,cutoff,budgets).amount:null;
 const remaining=verified?Math.max(0,T.variance(full.amount,actual)):future?full.amount:null;
 const remainingStart=verified?shift(cutoff,1):future?p.start:null,remainingAllocation=remainingStart?allocation(goal,fy,remainingStart,p.end,budgets):null;
 const amount=mode==='plan'?full.amount:remaining,days=mode==='plan'?full.days:remainingAllocation?.days??null,months=mode==='plan'?full.months:remainingAllocation?.months??null;
 const rate=n=>amount!=null&&n>0?amount/n:null,aov=assumptions.aov,cvr=assumptions.cvr;
 const orders=amount!=null&&Number.isFinite(aov)&&aov>0?amount/aov:null,sessions=orders!=null&&Number.isFinite(cvr)&&cvr>0&&cvr<=1?orders/cvr:null;
 return {...p,target:full.amount,actual,cutoff:verified?cutoff:null,expected,variance:T.variance(actual,expected),remaining,amount,days,months,monthly:rate(months),weekly:rate(days)==null?null:rate(days)*7,daily:rate(days),orders,sessions,ordersDaily:orders!=null&&days>0?orders/days:null,sessionsDaily:sessions!=null&&days>0?sessions/days:null,status:verified?'actual':future?'future':'missing',ended:days===0};
}
return {bounds,choices,resolve,allocation,calculate,londonDay,fyFor};
});
