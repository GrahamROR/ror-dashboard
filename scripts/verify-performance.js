// Read-only pre-release check. Only safe aggregate windows are retained as evidence.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const P=require('../growth/performance'),I=require('../finance/integration'),S=require('./fetch-data'),Collector=require('./collect-performance');
async function main(){
 const through=S.getYesterday(),token=await S.getShopifyToken(),performance=await Collector.collect({query:q=>S.runShopifyQL(token,q),through});
 const manifest=require('../finance/staging/manifest.json'),snapshot=require('../finance/staging/'+manifest.file);
 const checks=[];
 for(const range of P.ranges(through)){
  const expected=I.report(snapshot,range.start,range.end,'net_revenue'),actual=performance[range.key];
  assert.equal(expected.status,'actual','Current canonical coverage required');
  assert.equal(Math.round(actual.netSales*100),Math.round(expected.netSales*100),'Native merchandise control mismatch');
  assert.equal(Math.round(actual.revenue*100),Math.round(expected.totalSales*100),'Native total control mismatch');
  assert.equal(actual.orders,expected.orders,'Native orders control mismatch');
  assert.equal(P.view({data:{performance},snapshot,basis:'net_revenue',key:range.key,through}).windowVerified,true);
  checks.push({key:range.key,start:range.start,end:range.end,matched:true,netMerchandise:actual.netSales,totalSales:actual.revenue,orders:actual.orders});
 }
 const [monthlySales,monthlySessions]=await Promise.all([S.fetchMonthlySales(token,through),S.fetchMonthlySessions(token,through)]);
 for(const [key,row]of Object.entries(monthlySales)){
  const end=[through,key+'-'+String(new Date(Date.UTC(+key.slice(0,4),+key.slice(5,7),0)).getUTCDate())].sort()[0];
  const expected=I.report(snapshot,key+'-01',end,'net_revenue');
  assert.equal(expected.status,'actual');assert.equal(Math.round(row.netSales*100),Math.round(expected.netSales*100));assert.equal(Math.round(row.revenue*100),Math.round(expected.totalSales*100));assert.equal(row.orders,expected.orders);
 }
 const report={status:'verified',through,checks,performance,monthlySales,monthlySessions};
 const output=process.env.PERFORMANCE_EVIDENCE_PATH;
 if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:'verified',through,windows:checks.map(({key,start,end,matched})=>({key,start,end,matched}))}));
}
main().catch(()=>{console.error('Performance verification failed; no publication or source files changed.');process.exitCode=1;});
