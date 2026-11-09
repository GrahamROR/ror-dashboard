'use strict';
const C=require('./collect');
const A=require('./api-normalize');
async function d1(env,sql,transport=fetch) {
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID||'') || !/^[a-f0-9-]{36}$/.test(env.CLOUDFLARE_D1_DATABASE_ID||'') || !env.CLOUDFLARE_API_TOKEN) throw Error('Existing read-only database connection is required');
  const r=await transport(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${env.CLOUDFLARE_D1_DATABASE_ID}/query`,{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
  if (!r.ok) throw Error('Marketplace connection lookup failed HTTP '+r.status);
  const data=await r.json();
  if (!data.success || !Array.isArray(data.result?.[0]?.results)) throw Error('Marketplace connection lookup returned no valid results');
  return data.result[0].results;
}
async function credentials(env,transport=fetch,now=new Date()) {
  if (['ETSY_KEYSTRING','ETSY_SHARED_SECRET','NOTHS_TOKEN'].some(k=>!env[k])) throw Error('Marketplace read keys are not configured');
  const rows=await d1(env,'SELECT shop_id, access_token, expires_at FROM etsy_oauth_tokens WHERE id=1',transport),auth=rows[0];
  if (!/^\d+$/.test(auth?.shop_id||'') || !auth.access_token || Date.parse(auth.expires_at)<=now.getTime()+60000 || !Number.isFinite(Date.parse(auth.expires_at))) throw Error('Existing Etsy connection is missing or needs its normal StockHub refresh; no tokens changed');
  return {...env,ETSY_SHOP_ID:auth.shop_id,ETSY_ACCESS_TOKEN:auth.access_token};
}
function retrying(transport=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms))) {
  return async (url,options)=>{
    for(let attempt=0;attempt<5;attempt++) {
      const r=await transport(url,{...options,signal:AbortSignal.timeout(30000)});
      if (![429,502,503,504].includes(r.status)) return r;
      if(attempt===4) throw Error('Marketplace read retry limit reached');
      const retry=r.headers?.get('retry-after'),seconds=Number(retry),date=Date.parse(retry||'');
      const pause=retry&&Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?Math.max(0,date-Date.now()):1000*2**attempt;
      await wait(Math.max(1000,pause));
    }
  };
}
async function capture(env,ranges,{transport=fetch,wait,now=new Date()}={}) {
  const readEnv=await credentials(env,transport,now),fetcher=retrying(transport,wait),result={};
  for(const channel of ['etsy','noths'])result[channel]=await C.collect({channel,start:A.midnight(ranges[channel].start),end:A.midnight(require('../contract').next(ranges[channel].end)),env:readEnv,fetcher,maxPages:200});
  return result;
}
module.exports={d1,credentials,retrying,capture};
