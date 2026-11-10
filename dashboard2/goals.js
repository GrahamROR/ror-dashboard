// Goal presentation only: original management aggregation and shared seasonal maths.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./calculations'),require('../growth/targets'));else root.RorGoalPlan=factory(root.RorCalc,root.GrowthTargets);})(typeof window==='undefined'?globalThis:window,function(C,T){
'use strict';
function build(records,range,fy,target,channels){
 if(range.unsupported)return null;
 const plan=T.plan(target,fy,range.endDate);
 const months=plan.months.map(month=>{
  const future=month.elapsedDays===0,startDate=month.key+'-01',endDate=future?null:C.addDays(startDate,month.elapsedDays-1);
  const actual=future?null:C.aggregate(records,{channels,startDate,endDate});
  const revenue=actual?.status==='complete'?actual.revenue:null;
  const variance=future?null:T.variance(revenue,month.expectedTarget);
  const status=future?'future':variance==null?'pending':month.elapsedDays<month.days?'mtd':revenue>=month.expectedTarget?'green':revenue>=month.expectedTarget*0.85?'amber':'red';
  return {...month,startDate,endDate,future,actual,revenue,orders:actual?.orders??null,variance,status};
 });
 return {plan,months};
}
return {build};
});
