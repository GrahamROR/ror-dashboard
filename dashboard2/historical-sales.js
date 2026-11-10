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
function BasicPeriodHistory({context,range,channels=M.ACTIVE_CHANNELS,section='Page',title}){
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
const basisName=basis=>basis==='workbook-recorded-revenue'?'Recorded revenue':'Net Sales';
const countName=(basis,channel)=>basis==='workbook-recorded-revenue'?'Recorded orders':channel==='noths'?'Placed-order cohort':channel==='etsy'?'Eligible receipts':channel==='all'?'Source orders':'Eligible orders';
const confidenceName=value=>({'self-reported':'Workbook','historical-api-backfill':'Source-checked API history','provisional':'Live marketplace feed','source-verified':'Native Shopify feed'})[value]||value||'Unavailable';
const valueFormat=(value,metric,short=false)=>value==null?'—':metric==='orders'?(value<0?'−':'')+fmt(Math.abs(value)):(value<0?'−':'')+fmtC(Math.abs(value),short?0:2);
function ComparisonChange({comparison,metric='revenue',compact=false}){
 if(!comparison||comparison.status==='off')return null;
 const c=comparison,valid=['ok','zero-denominator'].includes(c.status),tone=c.absoluteChange>0?'var(--grn)':c.absoluteChange<0?'var(--red)':'var(--t2)';
 const source=[['Current',c.currentConfidence],['Previous',c.previousConfidence]].filter(([,v])=>v&&(!Array.isArray(v)||v.length)).map(([label,v])=>label+': '+(Array.isArray(v)?v:[v]).map(confidenceName).join(', ')).join(' · ');
 const title=[M.formatDateText(c.note||''),c.previous_period?M.monthLabel(c.previous_period):'',source].filter(Boolean).join(' · ');
 if(!valid){const label=c.status==='incompatible-basis'?'Basis changed':/full calendar|full months/i.test(c.note||'')?'Full months only':c.current!=null&&c.previous==null?'Prior period incomplete':'No complete comparison';return el('span',{'data-comparison-status':c.status,title,style:{fontSize:11,color:'var(--t3)'}},label);}
 return el('span',{'data-comparison-status':c.status,title,style:{fontSize:11,color:tone}},
  (c.absoluteChange>0?'+':'')+valueFormat(c.absoluteChange,metric),
  ' · ',c.percentChange==null?'% unavailable (prior = 0)':(c.percentChange>0?'+':'')+c.percentChange.toFixed(1)+'%'
 );
}
function HistorySelect({label,value,onChange,options,section}){
 return el('label',{style:{fontSize:11,color:'var(--t2)',display:'flex',flexDirection:'column',gap:5,minWidth:0}},label,
  el('select',{'aria-label':section+' history '+label.toLowerCase(),value,onChange:e=>onChange(e.target.value),style:{background:'var(--s2)',color:'var(--t1)',border:'1px solid var(--bdr2)',borderRadius:6,padding:'7px 10px',maxWidth:'100%',minWidth:0}},options.map(([key,text])=>el('option',{key,value:key},text)))
 );
}
function SourceSummaryCard({summary,metric='revenue',channel,mode,comparisonRange}){
 const color=metric==='orders'?'var(--blu)':M.CHANNEL_META[channel]?.color||'var(--amb)';
 const title=channel==='all'?(metric==='orders'?'All Stores source orders':'All Stores Net Sales'):metric==='orders'?M.CHANNEL_META[channel].label+' orders':M.CHANNEL_META[channel].label+' revenue';
 return el('div',{className:'card','data-history-summary':channel+':'+metric,style:{borderTop:'2px solid '+color,minWidth:0}},
  el('div',{className:'lbl',style:{display:'flex',gap:8,alignItems:'center',marginBottom:14}},el('i',{className:'ti '+(metric==='orders'?'ti-shopping-cart':'ti-currency-pound'),style:{color,fontSize:16}}),title),
  summary.groups.map(group=>{
   const full=metric==='orders'?group.orderFull:group.full,value=metric==='orders'?group.orderSubtotal:group.subtotal,known=metric==='orders'?group.countedMonths:group.knownMonths;
   return el('div',{key:group.basis,'data-summary-basis':group.basis,style:{marginTop:10}},
    el('div',{style:{fontSize:11,color:'var(--t2)',marginBottom:5}},!summary.hasKnownBasis?'Source data unavailable':metric==='orders'?countName(group.basis,channel):basisName(group.basis),!full?' · subtotal':''),
    el('div',{className:'mono',style:{fontSize:summary.mixed?24:29,fontWeight:700,color,letterSpacing:'-0.03em',lineHeight:1.3}},valueFormat(value,metric)),
    el('div',{style:{fontSize:11,color:'var(--t3)',marginTop:5}},summary.mixed?known+' months · source subtotal':known+' / '+group.expectedMonths+' months with '+(metric==='orders'?'counts':'figures'))
   );
  }),
  mode!=='none'&&el('div',{style:{marginTop:12}},el(ComparisonChange,{comparison:summary.comparisons[metric],metric})),
  mode!=='none'&&comparisonRange&&el('div',{style:{fontSize:10,color:'var(--t3)',marginTop:5}},'vs '+M.formatDate(comparisonRange.startDate)+' → '+M.formatDate(comparisonRange.endDate)),
  summary.mixed&&el('div',{className:'badge ba',style:{marginTop:10}},'Source amounts kept separate')
 );
}
function HistoricalDashboard({context,range,channels=M.ACTIVE_CHANNELS,section='Page',title}){
 const [metric,setMetric]=useState('revenue'),[mode,setMode]=useState('previous-year'),[chartType,setChartType]=useState('bar');
 const calculated=useMemo(()=>{try{return {data:root.RorHistoricalComparison.analyse(context,range,channels,mode,metric)};}catch{return {error:true};}},[context,range.startDate,range.endDate,channels.join(','),mode,metric]);
 if(!calculated.data)return el(BasicPeriodHistory,{context,range,channels,section,title});
 const data=calculated.data,single=channels.length===1,channel=channels[0],tableChannels=data.showCombined?[...channels,'all']:channels;
 const comparisonLabel=mode==='previous-year'?'same month last year':mode==='previous-period'?'previous month':'off';
 const series=data.series.map(s=>({...s,channels:[s.channel],label:M.CHANNEL_META[s.channel].label+' · '+(metric==='orders'?countName(s.basis,s.channel):basisName(s.basis)),color:s.channel==='shopify'&&s.basis==='net_revenue'&&data.summaries.shopify.mixed?'var(--blu)':M.CHANNEL_META[s.channel].color,points:s.points.map(p=>({...p,bucket:{key:p.period,label:M.monthLabel(p.period)}}))}));
 const comparisonSeries=mode==='none'?null:series.map(s=>({...s,points:s.points.map(p=>({...p,value:p.previous,note:p.comparison.note||'No comparable prior month.'}))})).filter(s=>s.points.some(p=>Number.isFinite(p.value)));
 const combined=data.summaries.all;
 const header=label=>el('th',{key:label,style:{padding:'10px 12px',textAlign:'left',fontSize:11,color:'var(--t2)',fontWeight:500,whiteSpace:'nowrap'}},label);
 const td=(content,props={})=>el('td',{...props,style:{padding:'11px 12px',verticalAlign:'middle',...props.style}},content);
 const displayCell=(row,c)=>{
  const p=row[c],comparison=row.comparisons[c],value=p?.[metric==='revenue'?'value':'orders'],mixed=data.summaries[c]?.mixed;
  return td(el(React.Fragment,null,
   el('div',{className:'mono',style:{fontSize:13,fontWeight:500}},valueFormat(value,metric)),
   !single&&mode!=='none'&&el('div',{style:{marginTop:4}},el(ComparisonChange,{comparison,metric,compact:true})),
   p?.status==='partial-source'&&el('span',{className:'badge ba',style:{fontSize:9,marginTop:4}},'Partial source'),
   mixed&&p?.basis&&el('div',{style:{fontSize:10,color:'var(--t3)',marginTop:4}},p.basis==='workbook-recorded-revenue'?'Workbook':metric==='orders'?'Native eligible orders':'Native Net Sales')
  ),{'data-history-channel':c,'data-history-basis':p?.basis||'unavailable',title:M.formatDateText(p?.reason||'')});
 };
 return el('div',{'data-history-report':section,'data-historical-content':true,style:{marginBottom:20}},
  el('div',{className:'card',style:{display:'flex',flexWrap:'wrap',gap:14,justifyContent:'space-between',alignItems:'center',marginBottom:14}},
   el('div',null,el('div',{style:{fontSize:16,fontWeight:600}},title||'Sales history · '+range.label),el('div',{'data-report-period':section+' history',style:{fontSize:11,color:'var(--t2)',marginTop:6}},M.formatDate(range.startDate)+' → '+M.formatDate(range.endDate)+' (inclusive)')),
   el('span',{className:'badge ba'},'Monthly history')
  ),
  el('div',{className:'grid-auto',style:{display:'grid',gridTemplateColumns:single?'repeat(3,minmax(0,1fr))':'repeat('+Math.min(channels.length+(combined?.part.value!=null?1:0),4)+',minmax(0,1fr))',gap:12,marginBottom:16}},
   ...(single?[
    el(SourceSummaryCard,{key:'revenue',summary:data.summaries[channel],channel,metric:'revenue',mode,comparisonRange:data.previousRange}),
    el(SourceSummaryCard,{key:'orders',summary:data.summaries[channel],channel,metric:'orders',mode,comparisonRange:data.previousRange}),
    el('div',{key:'coverage',className:'card','data-history-coverage':true,style:{borderTop:'2px solid var(--pur)'}},el('div',{className:'lbl',style:{marginBottom:14}},'Months with revenue data'),el('div',{className:'mono',style:{fontSize:29,fontWeight:700,color:'var(--pur)'}},data.summaries[channel].knownMonths+' / '+data.summaries[channel].expectedMonths),el('div',{style:{fontSize:11,color:'var(--t2)',marginTop:10,lineHeight:1.7}},data.summaries[channel].mixed?'Recorded revenue and native Net Sales are shown separately.':data.summaries[channel].completeMonths<data.summaries[channel].knownMonths?'Includes partial months; growth comparisons use full months.':'Missing months are unavailable; source coverage is kept explicit.'))
   ]:channels.map(c=>el(SourceSummaryCard,{key:c,summary:data.summaries[c],channel:c,metric,mode,comparisonRange:data.previousRange}))),
   combined?.part.value!=null&&el(SourceSummaryCard,{summary:combined,channel:'all',metric,mode,comparisonRange:data.previousRange})
  ),
  el('div',{className:'card',style:{marginBottom:16}},
   el('div',{style:{display:'flex',flexWrap:'wrap',gap:16,alignItems:'flex-end',justifyContent:'space-between',marginBottom:16}},
    el('div',null,el('div',{style:{fontSize:14,fontWeight:600}},'Monthly '+(metric==='orders'?'orders':'revenue')),el('div',{style:{fontSize:11,color:'var(--t3)',marginTop:5}},'Separate source series · comparisons use complete, matching months')),
    el('div',{style:{display:'flex',flexWrap:'wrap',gap:12}},
     el(HistorySelect,{section,label:'Metric',value:metric,onChange:setMetric,options:[['revenue','Revenue'],['orders','Orders']]}),
     el(HistorySelect,{section,label:'Compare with',value:mode,onChange:setMode,options:[['previous-year','Same months last year'],['previous-period','Previous period'],['none','No comparison']]}),
     el(HistorySelect,{section,label:'Chart',value:chartType,onChange:setChartType,options:[['bar','Bar'],['line','Line']]})
    )
   ),
   !series.some(s=>s.points.some(p=>Number.isFinite(p.value)))?el('div',{role:'status',style:{padding:'40px 12px',fontSize:12,color:'var(--t2)'}},'No complete monthly figures to chart for this selection. Partial amounts remain in the table.'):data.negativeChartValues?el('div',{role:'status',style:{fontSize:12,color:'var(--t2)'}},'Negative monthly amounts remain visible in the table; this chart is unavailable for this selection.'):
    el(RorCharts.SalesChart,{key:[section,range.startDate,range.endDate,metric,mode,chartType].join(':'),type:chartType,series,comparisonSeries,preserveComparisonGaps:true,constrainTooltip:true,formatValue:(v,short)=>valueFormat(v,metric,short)}),
   el('div',{style:{fontSize:11,color:'var(--t3)',marginTop:12,lineHeight:1.7}},'Missing, partial or incompatible months leave gaps. '+(mode==='none'?'Comparisons are off.':'Chart and table compare each month with the '+comparisonLabel+'. Summary cards compare the whole selected period.'))
  ),
  el('div',{className:'card'},
   el('div',{style:{fontSize:14,fontWeight:600,marginBottom:12}},'Monthly breakdown'),
   el('div',{className:'table-scroll-hint',style:{fontSize:11,color:'var(--t3)',marginBottom:8}},'Swipe for the full monthly breakdown →'),
   data.rows.length?el('div',{style:{overflowX:'auto',WebkitOverflowScrolling:'touch'}},el('table',{'aria-label':'Historical monthly sales · '+section,style:{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:single&&mode!=='none'?640:480}},
    el('thead',null,el('tr',{style:{borderBottom:'1px solid var(--bdr2)'}},header('Month'),...tableChannels.map(c=>el('th',{key:c,style:{padding:'10px 12px',textAlign:'left',fontSize:11,color:'var(--t2)',fontWeight:500,whiteSpace:'nowrap'}},c==='all'?(metric==='orders'?'All Stores source orders':'All Stores Net Sales'):single?(!data.summaries[c].hasKnownBasis?(metric==='orders'?'Orders':'Revenue'):data.summaries[c].mixed?(metric==='orders'?'Orders · source basis':'Revenue · source basis'):metric==='orders'?countName(data.summaries[c].groups[0].basis,c):basisName(data.summaries[c].groups[0].basis)):M.CHANNEL_META[c].label,!single&&c!=='all'&&el('div',{style:{fontSize:10,color:'var(--t3)',marginTop:4}},data.summaries[c].mixed?'Source bases shown below':metric==='orders'?countName(data.summaries[c].groups[0].basis,c):basisName(data.summaries[c].groups[0].basis)))),single&&metric==='revenue'&&header('Orders'),single&&mode!=='none'&&header(mode==='previous-year'?'Prior year':'Prior month'),single&&mode!=='none'&&header('Change'))),
    el('tbody',null,data.rows.map(row=>el('tr',{key:row.period,'data-history-month':row.period,style:{borderBottom:'1px solid var(--bdr)'}},
     td(el(React.Fragment,null,M.monthLabel(row.period),row.partial_period&&el('div',{style:{fontSize:9,color:'var(--t3)',marginTop:3}},M.formatDate(row.start)+' → '+M.formatDate(row.end))),{style:{whiteSpace:'nowrap'}}),
     ...tableChannels.map(c=>displayCell(row,c)),single&&metric==='revenue'&&td(el('span',{className:'mono'},row[channel].orders==null?'—':fmt(row[channel].orders))),
     single&&mode!=='none'&&td(el('span',{className:'mono',style:{color:'var(--t2)'}},valueFormat(['ok','zero-denominator'].includes(row.comparisons[channel].status)?row.comparisons[channel].previous:null,metric))),
     single&&mode!=='none'&&td(el(ComparisonChange,{comparison:row.comparisons[channel],metric}))
    )))
   )):el('div',{role:'status'},'No source history is available for these dates.'),
   channels.length>1&&channels.includes('shopify')&&!data.showCombined&&el('div',{style:{fontSize:11,color:'var(--t2)',marginTop:12}},'Combined Net Sales is unavailable where Shopify recorded revenue has no confirmed Net Sales basis. Each store remains visible separately.')
  ),
  el('details',{className:'card',style:{marginTop:16,fontSize:12,lineHeight:1.8},'data-history-source-info':true},
   el('summary',{style:{cursor:'pointer',color:'var(--amb)',fontWeight:500}},'Source information and comparison rules'),
   channels.includes('shopify')&&el('p',null,'Workbook months contain recorded revenue and recorded orders. Native Shopify months contain Net Sales and eligible orders. Comparisons across '+M.formatDate(context.boundaries.shopify)+' are withheld when those definitions change. No daily figures, profit or combined Net Sales are inferred from workbook revenue.'),
   channels.some(c=>c!=='shopify')&&el('p',null,'Marketplace amounts use the agreed Net Sales maths. API history remains source checked and is kept distinct from the live feed; this is not independent accounting reconciliation. NOTHS counts remain its original placed-order cohort.'),
   el('p',null,'Changes require complete, compatible calendar months. A zero prior amount has an absolute change but no percentage. Subtotals never stand in for complete-period totals. Mixed Shopify years show their source amounts separately.'),
   ...channels.map(c=>el('p',{key:c},M.CHANNEL_META[c].label+' · History starts '+M.formatDate(context.starts[c])+' · Current sources: '+[...new Set(data.summaries[c].groups.flatMap(g=>g.confidences))].map(confidenceName).join(', ')+(mode!=='none'?' · Comparison sources: '+(data.summaries[c].comparisons[metric].previousConfidence||[]).map(confidenceName).join(', '):''))),
   el('p',null,'Reporting cutoff '+M.formatDate(context.through)+'. Requested dates remain '+M.formatDate(range.startDate)+' → '+M.formatDate(range.endDate)+'.')
  )
 );
}
function PeriodHistory(props){
 return root.RorHistoricalComparison&&root.RorCharts?.SalesChart&&props.context&&!props.range.unsupported?el(HistoricalDashboard,props):el(BasicPeriodHistory,props);
}

root.RorHistoricalPeriod=PeriodHistory;
root.RorHistoricalSales=HistoricalSales;
})(window);
