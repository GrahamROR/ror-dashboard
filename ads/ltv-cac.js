// Conservative completeness guard; preserves the existing period-proxy methodology.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LtvCac=factory();})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const known=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 function spend(meta,google){return known(meta?.spend)&&known(google?.spend)?Math.round((meta.spend+google.spend)*100)/100:null;}
 function safeWindow(w){if(!w)return w;const blended=spend(w.adSpend?.meta,w.adSpend?.google);return {...w,adSpend:{...w.adSpend,blended},cac:blended==null?null:w.cac,ratio:blended==null?null:w.ratio};}
 return {spend,safeWindow};
});
