'use strict';
const P=require('../growth/performance');
const numeric=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))?Number(value):null;
const money=value=>{const n=numeric(value);return n!=null&&Number.isSafeInteger(Math.round(n*100))?Math.round(n*100)/100:null;};
const count=value=>{const n=numeric(value);return n!=null&&Number.isSafeInteger(n)&&n>=0?n:null;};
async function collect({query,through}){
 const windows={};
 for(const range of P.ranges(through)){
  const bounds=`SINCE ${range.start} UNTIL ${range.end}`;
  const [sales,sessions]=await Promise.all([
   query(`FROM sales SHOW total_sales, net_sales, orders, average_order_value, returning_customers, customers, cost_of_goods_sold, gross_profit ${bounds}`),
   query(`FROM sessions SHOW sessions, conversion_rate, sessions_that_completed_checkout ${bounds}`)
  ]);
  if(sales.length!==1||sessions.length!==1)throw Error('Performance window source rows unavailable');
  const s=sales[0],a=sessions[0],revenue=money(s.total_sales),netSales=money(s.net_sales),orders=count(s.orders),customers=count(s.customers),returning=count(s.returning_customers),visits=count(a.sessions),converted=count(a.sessions_that_completed_checkout);
  if([revenue,netSales,orders,customers,returning,visits,converted].some(v=>v==null)||converted>visits||returning>customers)throw Error('Performance window source components unavailable');
  const cogs=money(s.cost_of_goods_sold),grossProfit=money(s.gross_profit),costedRevenue=cogs!=null&&grossProfit!=null?cogs+grossProfit:null;
  const margin=costedRevenue?grossProfit/costedRevenue:null;
  windows[range.key]={start:range.start,end:range.end,status:'complete',revenue,netSales,orders,aov:money(s.average_order_value),customers,returning,repeatRate:customers>0?returning/customers:null,sessions:visits,convertedSessions:converted,conversionRate:visits>0?converted/visits:null,shopifyConversionRate:numeric(a.conversion_rate),margin:margin==null?null:Math.round(margin*1000)/1000,profit:margin==null?null:Math.round(netSales*margin*100)/100,costCoverage:netSales&&costedRevenue!=null?Math.round(costedRevenue/netSales*1000)/1000:null,marginSource:margin==null?'pending_sku_cost_data':'Shopify Analytics cost_of_goods_sold/gross_profit (costed SKUs)',profitSource:margin==null?'pending_sku_cost_data':'estimated: net_sales × margin % (costed SKUs)'};
 }
 return {schema:'shopify-performance-v1',timezone:'Europe/London',through,status:'complete',...windows};
}
module.exports={collect};
