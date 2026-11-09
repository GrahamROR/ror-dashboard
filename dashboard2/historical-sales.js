(function(root){
'use strict';
const M=root.RorModel,H=root.RorHistoricalFinance;
const sourceLabel=p=>p.confidence==='self-reported'?'Workbook · recorded revenue':p.confidence===H.HIST?'API history · Net Sales':p.value!=null?'Native feed · Net Sales':'';
function Cell({part,showReason=false}){
 return el('td',{style:{padding:'10px 12px',verticalAlign:'top',minWidth:145},title:M.formatDateText(part.reason||'')},
  el('div',{className:'mono',style:{fontWeight:500}},fmtC(part.value,2)),
  part.value!=null&&el('div',{style:{fontSize:10,color:'var(--t2)',marginTop:3}},sourceLabel(part)),
  part.value!=null&&el('div',{style:{fontSize:10,color:'var(--t2)'}},part.orders==null?'Order count unavailable':fmt(part.orders)+' orders'),
  showReason&&part.value==null&&part.reason&&el('div',{style:{fontSize:10,color:'var(--t2)',marginTop:3}},part.reason),
  part.status==='partial-source'&&el('div',{style:{fontSize:10,color:'var(--amb)'}},'Partial source coverage · recorded subtotal')
 );
}
function Content({financeSnapshot,marketplaceSnapshot,financeError,marketplaceError}){
 const[data,setData]=useState(null),[error,setError]=useState(''),[selectedYear,setYear]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setError('');Promise.resolve().then(()=>{if(!root.RorHistoricalLoader?.load)throw Error('Historical loader unavailable');return root.RorHistoricalLoader.load({force:attempt>0});}).then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError('Historical archive could not be loaded. Current reporting remains available.');});return()=>{active=false;};},[attempt]);
 const through=RorCalc.resolveDateRange('yesterday').endDate;
 const prepared=useMemo(()=>{
  if(!data||!financeSnapshot||!marketplaceSnapshot)return null;
  try{return {context:H.prepare({...data,shop:financeSnapshot,markets:marketplaceSnapshot,through})};}
  catch{return {error:'Historical source boundaries or validation need attention. Current reporting remains available.'};}
 },[data,financeSnapshot,marketplaceSnapshot,through]);
 if(error||prepared?.error)return el('div',{role:'status',style:{paddingTop:12,color:'var(--amb)'}},error||prepared.error,el('button',{onClick:()=>setAttempt(n=>n+1),style:{marginLeft:12}},'Retry historical data'));
 if((financeError&&!financeSnapshot)||(marketplaceError&&!marketplaceSnapshot))return el('div',{role:'status',style:{paddingTop:12,color:'var(--amb)'}},'Current source boundaries are unavailable; historical figures cannot be combined yet.');
 if(!prepared)return el('div',{role:'status',style:{paddingTop:12,color:'var(--t2)'}},'Loading historical sources and current reporting boundaries…');
 const context=prepared.context,year=selectedYear||context.default_year,rows=Array.from({length:12},(_,i)=>context.month(year+'-'+String(i+1).padStart(2,'0')));
 return el('div',{'data-historical-content':true},
  el('p',{style:{fontSize:12,color:'var(--t2)',marginTop:12,lineHeight:1.7}},'Monthly source history. Marketplace amounts use the agreed Net Sales maths. API history is source checked and remains distinct from the independently controlled live feed. Shopify workbook revenue is self-reported, monthly only, and has no confirmed Net/Gross basis; it is kept separate from combined Net Sales.'),
  el('div',{style:{display:'flex',flexWrap:'wrap',gap:12,alignItems:'center',margin:'14px 0'}},
   el('label',{style:{fontSize:12}},'Calendar year ',el('select',{'aria-label':'Historical reporting year',value:year,onChange:e=>setYear(e.target.value),style:{background:'var(--s2)',color:'var(--t1)',border:'1px solid var(--bdr2)',borderRadius:6,padding:'7px 10px',marginLeft:8}},context.years.map(y=>el('option',{key:y,value:y},y)))),
   el('span',{style:{fontSize:11,color:'var(--t2)'}},'Earliest available source: '+M.formatDate(context.earliest.length===7?context.earliest+'-01':context.earliest)+' · Reporting cutoff: '+M.formatDate(context.through))
  ),
  el('div',{className:'table-scroll-hint',style:{fontSize:11,color:'var(--t2)',marginBottom:8}},'Swipe to see all stores →'),
  el('div',{style:{overflowX:'auto',WebkitOverflowScrolling:'touch'}},el('table',{'aria-label':'Historical monthly sales',style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
   el('thead',null,el('tr',null,['Month','Shopify','Etsy Net Sales','NOTHS Net Sales','All Stores Net Sales'].map(label=>el('th',{key:label,style:{padding:'10px 12px',textAlign:'left',color:'var(--t2)',whiteSpace:'nowrap'}},label)))),
   el('tbody',null,rows.map(row=>el('tr',{key:row.period,'data-history-month':row.period,style:{borderTop:'1px solid var(--bdr)'}},
    el('td',{style:{padding:'10px 12px',verticalAlign:'top',whiteSpace:'nowrap'}},M.monthLabel(row.period),row.partial_period&&el('div',{style:{fontSize:10,color:'var(--amb)'}},'Through '+M.formatDate(row.end))),
    el(Cell,{part:row.shopify}),el(Cell,{part:row.etsy}),el(Cell,{part:row.noths}),el(Cell,{part:row.all})
   )))
  )),
  el('p',{style:{fontSize:11,color:'var(--t2)',marginTop:12}},'A dash means unavailable or incompatible source data. No daily Shopify figures are inferred from workbook months. All Stores Net Sales appears only where every channel supports that basis and the full displayed period.'),
  el('p',{style:{fontSize:11,color:'var(--t2)',marginTop:6}},'Live source coverage starts · Shopify '+M.formatDate(context.boundaries.shopify)+' · Etsy '+M.formatDate(context.boundaries.etsy)+' · NOTHS '+M.formatDate(context.boundaries.noths))
 );
}
function HistoricalSales(props){
 const[opened,setOpened]=useState(false);
 return el('details',{className:'card','data-ror-section':'history',style:{marginBottom:16},onToggle:e=>{if(e.currentTarget.open)setOpened(true);}},
  el('summary',{style:{cursor:'pointer',color:'var(--amb)',fontWeight:500}},'Historical sales · Monthly archive'),
  opened&&el(Content,props)
 );
}

// The regular date controls use this view whenever their period needs archive data.
// It never sends workbook amounts into native Growth or management calculations.
function PeriodHistory({context,range,channels=M.ACTIVE_CHANNELS,section='Page',title}){
 if(!context)return el('div',{role:'status'},'Historical source data is unavailable. Retry earlier years above.');
 if(range.unsupported)return el('div',{role:'status'},M.formatDateText(range.reason));
 const rows=H.rangeRows(context,range),combined=channels.length>1;
 const labels={shopify:'Shopify revenue · source basis',etsy:'Etsy Net Sales',noths:'NOTHS Net Sales'};
 return el('div',{className:'card','data-history-report':section,'data-historical-content':true,style:{marginBottom:16}},
  el('div',{style:{fontWeight:600,fontSize:15,marginBottom:8}},title||'Sales history · '+range.label),
  el('div',{'data-report-period':section+' history',style:{fontSize:12,lineHeight:1.7,marginBottom:10}},M.formatDate(range.startDate)+' → '+M.formatDate(range.endDate)+' (inclusive)'),
  el('p',{style:{fontSize:12,color:'var(--t2)',lineHeight:1.7}},'Monthly sales history for the selected dates and stores. '+(channels.some(c=>c!=='shopify')?'Marketplace figures use the agreed Net Sales maths. ':'')+(channels.includes('shopify')?'Shopify workbook months show recorded revenue and orders; their Net/Gross basis is unconfirmed. Daily figures, profit and growth comparisons are unavailable for workbook-only periods.':'')),
  el('div',{className:'table-scroll-hint',style:{fontSize:11,color:'var(--t2)',marginBottom:8}},'Swipe to see all stores →'),
  rows.length?el('div',{style:{overflowX:'auto',WebkitOverflowScrolling:'touch'}},el('table',{'aria-label':'Historical monthly sales · '+section,style:{width:'100%',borderCollapse:'collapse',fontSize:12}},
   el('thead',null,el('tr',null,['Month',...channels.map(c=>labels[c]),...(combined?['All Stores Net Sales']:[])].map(label=>el('th',{key:label,style:{padding:'10px 12px',textAlign:'left',color:'var(--t2)',whiteSpace:'nowrap'}},label)))),
   el('tbody',null,rows.map(row=>el('tr',{key:row.period,'data-history-month':row.period,style:{borderTop:'1px solid var(--bdr)'}},
    el('td',{style:{padding:'10px 12px',verticalAlign:'top',whiteSpace:'nowrap'}},M.monthLabel(row.period),row.partial_period&&el('div',{style:{fontSize:10,color:'var(--amb)'}},M.formatDate(row.start)+' → '+M.formatDate(row.end))),
    ...channels.map(c=>el(Cell,{key:c,part:row[c],showReason:true})),combined&&el(Cell,{part:row.all,showReason:true})
   )))
  )):el('div',{role:'status'},'No source history is available for these dates.'),
  el('p',{style:{fontSize:11,color:'var(--t2)',marginTop:12,lineHeight:1.7}},'Source labels apply to each amount. '+(channels.includes('shopify')?'No daily Shopify figures are inferred from workbook months. A partial workbook month is unavailable. ':'')+(combined?'Combined Net Sales requires complete, compatible sources; recorded workbook revenue is kept separate.':'')),
  el('p',{style:{fontSize:11,color:'var(--t2)',marginTop:6}},'Source history starts · '+channels.map(c=>M.CHANNEL_META[c].short+' '+M.formatDate(context.starts[c])).join(' · ')+' · Reporting cutoff '+M.formatDate(context.through))
 );
}
root.RorHistoricalPeriod=PeriodHistory;
root.RorHistoricalSales=HistoricalSales;
})(window);
