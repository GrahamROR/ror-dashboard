'use strict';
// One-off, manual history capture. Never scheduled and never writes live finance stores.
const B=require('../finance/marketplaces/historical-backfill');
async function main(){
 const args=process.argv.slice(2),channelIndex=args.indexOf('--channel'),channels=channelIndex<0?['etsy','noths']:[args[channelIndex+1]];
 if(channels.some(c=>!['etsy','noths'].includes(c))||args.some((a,i)=>!['--force','--capture-only','--channel'].includes(a)&&!(channelIndex>=0&&i===channelIndex+1)))throw Error('Unsupported historical backfill option');
 const result=await B.run({force:args.includes('--force'),channels,publishArchive:!args.includes('--capture-only'),onProgress:p=>console.log(JSON.stringify(p))});
 if(result.publication)console.log(JSON.stringify({status:'historical-archive-written',publication:result.publication}));
}
if(require.main===module)main().catch(()=>{console.error('Historical backfill failed; completed private checkpoints retained. Live financial data was not changed.');process.exitCode=1;});
module.exports={main};
