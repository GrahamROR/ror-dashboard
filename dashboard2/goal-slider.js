// Local All Stores what-if presentation. Shared goal allocation and source gates are unchanged.
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./goals'),require('./calculations'),require('../growth/targets'));
 else root.RorGoalSlider=factory(root.RorGoalPlan,root.RorCalc,root.GrowthTargets);
})(typeof window==='undefined'?globalThis:window,function(G,C,T){
'use strict';
function build(records,range,fy,target,channels){
 const report=G.build(records,range,fy,target,channels);
 if(!report)return null;
 const aggregate=C.aggregate(records,{channels,startDate:range.startDate,endDate:range.endDate});
 const actual=aggregate.status==='complete'?aggregate.revenue:null;
 const orders=aggregate.status==='complete'&&aggregate.ordersStatus!=='incomplete-data'?aggregate.orders:null;
 const days=report.plan.months.reduce((n,m)=>n+m.days,0);
 const dailyAverage=target/days;
 const salesPerOrder=actual>0&&orders>0?actual/orders:null;
 return {...report,actual,orders,ytdTarget:report.plan.ytdTarget,variance:T.variance(actual,report.plan.ytdTarget),
  days,monthlyAverage:target/12,weeklyAverage:target/52,dailyAverage,salesPerOrder,
  ordersPerDay:salesPerOrder==null?null:dailyAverage/salesPerOrder};
}
return {build};
});
