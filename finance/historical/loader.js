(function(root){
'use strict';
let pending;
async function load({force=false}={}){
 if(force)pending=null;
 if(!pending)pending=(async()=>{
  const response=await fetch('finance/historical/manifest.json',{cache:'no-store'});
  if(!response.ok)throw Error('Historical archive is unavailable.');
  const registry=await response.json();
  if(registry.schema!=='ror-historical-bundle-v1'||!/^finance\/marketplaces\/historical\/snapshots\/[a-f0-9]{64}\.json$/.test(registry.marketplaces?.file)||registry.shopify?.file!=='finance/historical/shopify-legacy.json'||registry.coverage?.file!=='finance/historical/coverage-check.json')throw Error('Historical bundle manifest is invalid.');
  async function checked(entry){
   if(!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Historical bundle hash is invalid.');
   const r=await fetch(entry.file+'?historical='+entry.sha256,{cache:'no-store'});
   if(!r.ok)throw Error('Historical source is unavailable.');
   const bytes=await r.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   if(digest!==entry.sha256)throw Error('Historical source integrity check failed.');
   return JSON.parse(new TextDecoder().decode(bytes));
  }
  const[archive,legacy,coverage]=await Promise.all([checked(registry.marketplaces),checked(registry.shopify),checked(registry.coverage)]);
  if(coverage.status!=='coverage-verified'||coverage.archive_sha256!==registry.marketplaces.sha256||['etsy','noths'].some(c=>coverage.channels?.[c]?.status!=='matched'||coverage.channels[c].historical_source_orders!==archive.channels[c].audit.source_orders))throw Error('Historical coverage proof is inconsistent.');
  return {archive,legacy};
 })();
 try{return await pending;}catch(error){pending=null;throw error;}
}
root.RorHistoricalLoader={load};
})(window);
