// Approved annual targets. What-If edits are local; no scenario or cost model.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.FinancialGoals=factory();})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
function annual(fy,scope='shopify'){return scope==='all'?500000:fy==='FY27'?300000:500000;}
return {basis:'net_revenue',annual};
});
