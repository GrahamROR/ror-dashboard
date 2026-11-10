// Independent local exploration beside the approved Monthly Goals card.
(function(root){
'use strict';
const M=root.RorModel;
function GoalBars({months}){
 const values=months.flatMap(m=>m.revenue==null?[m.fullTarget]:[m.fullTarget,m.revenue]);
 const high=Math.max(1,...values),low=Math.min(0,...values),scale=80/(high-low),y=value=>12+(high-value)*scale,zero=y(0);
 const description=m=>M.monthLabel(m.key)+': Net Sales actual '+fmtC(m.revenue,2)+'; full-month target '+fmtC(m.fullTarget,2)+'; '+(m.future?'future':m.status==='pending'?'financial data unavailable':m.status==='mtd'?'partial-month actual, '+m.elapsedDays+'/'+m.days+' completed days':'completed month');
 const colours={green:'var(--grn)',amber:'var(--amb)',red:'var(--red)',mtd:'var(--amb)'};
 return el('div',{style:{marginTop:14,paddingTop:14,borderTop:'1px solid var(--bdr)'}},
  el('div',{className:'lbl'},'All Stores Net Sales vs full-month target'),
  el('p',{style:{fontSize:11,color:'var(--t2)',margin:'6px 0'}},'White outlines: full-month target · Coloured bars: covered actuals. MTD is partial; future and unavailable actuals show a dash.'),
  el('svg',{role:'img','aria-label':'Monthly All Stores what-if goal chart. '+months.map(description).join('. '),viewBox:'0 0 720 100',style:{display:'block',width:'100%',height:'auto'}},
   el('line',{x1:0,x2:720,y1:zero,y2:zero,stroke:'var(--bdr2)'}),
   months.map((m,i)=>el('g',{key:m.key,'data-slider-month':m.key},
    el('title',null,description(m)),
    el('rect',{x:i*60+10,y:y(m.fullTarget),width:18,height:zero-y(m.fullTarget),fill:'none',stroke:'var(--t1)',rx:2}),
    m.revenue==null?el('text',{x:i*60+40,y:zero-5,textAnchor:'middle',fill:'var(--t2)',fontSize:12},'—'):
     m.revenue===0?el('line',{'data-slider-actual':m.key,x1:i*60+33,x2:i*60+51,y1:zero,y2:zero,stroke:colours[m.status],strokeWidth:2}):
     el('rect',{'data-slider-actual':m.key,x:i*60+33,y:Math.min(zero,y(m.revenue)),width:18,height:Math.abs(m.revenue)*scale,fill:colours[m.status],rx:2})
   ))
  ),
  el('div',{style:{display:'grid',gridTemplateColumns:'repeat(12,minmax(0,1fr))',fontSize:10,color:'var(--t2)',textAlign:'center',marginTop:4}},months.map(m=>el('span',{key:m.key},M.monthLabel(m.key).split(' ')[0])))
 );
}
function GoalSliderContent({records,range,fy,target:approved}){
 const [target,setTarget]=useState(approved),[locked,setLocked]=useState(true);
 const report=useMemo(()=>root.RorGoalSlider.build(records,range,fy,target,M.ACTIVE_CHANNELS),[records,range,fy,target]);
 const min=approved*0.5,max=approved*2.5,step=5000;
 const changed=target!==approved,colour=report?.variance==null?'var(--t2)':report.variance>=0?'var(--grn)':'var(--red)';
 return el('div',{'data-ror-goal-slider':true,style:{paddingTop:14}},
  el('p',{style:{fontSize:12,color:'var(--t2)',lineHeight:1.6,margin:'0 0 14px'}},fy+' · All Stores Net Sales · '+(report?'Through '+M.formatDate(range.endDate)+'. ':'')+'Independent of page filters. Local what-if only; the approved '+fmtC(approved,0)+' goal and Monthly Goals card stay unchanged. Marketplace Net Sales retains its provisional management assumptions.'),
  el('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:16,marginBottom:16}},
   el('div',null,
    el('div',{style:{display:'flex',flexWrap:'wrap',alignItems:'center',gap:8,marginBottom:7}},
     el('div',{className:'lbl'},locked?'Net Sales goal — locked':'Net Sales goal — drag to explore'),
     el('button',{type:'button','aria-label':locked?'Unlock goal slider':'Lock goal slider',onClick:()=>setLocked(v=>!v),style:{minHeight:36,padding:'6px 10px',fontSize:11,borderColor:locked?'var(--amb)':'var(--bdr2)',color:locked?'var(--amb)':'var(--t2)',background:locked?'var(--amb-bg)':'var(--s3)'}},el('i',{className:locked?'ti ti-lock':'ti ti-lock-open','aria-hidden':true}),locked?' Locked':' Unlocked'),
     el('button',{type:'button',disabled:locked&&!changed,onClick:()=>{setTarget(approved);setLocked(true);},style:{fontSize:11,minHeight:36,opacity:locked&&!changed?0.5:1}},'Reset to main goal')
    ),
    el('div',{'data-slider-target':true,style:{fontSize:34,fontWeight:700,fontFamily:"'DM Mono',monospace",color:'var(--amb)',lineHeight:1.2}},fmtC(target,0)),
    el('div',{style:{fontSize:11,color:'var(--t2)',marginTop:4}},changed?'Hypothetical annual goal':'Approved annual goal')
   ),
   el('div',{style:{display:'flex',flexWrap:'wrap',gap:16}},[
    ['YTD Net Sales actual',fmtC(report?.actual,2),colour,'actual'],
    ['YTD target',fmtC(report?.ytdTarget,2),'var(--t2)','target'],
    ['YTD variance',GrowthTargets.signed(report?.variance),colour,'variance'],
   ].map(([label,value,col,key])=>el('div',{key,style:{textAlign:'right'}},el('div',{className:'lbl'},label),el('div',{'data-slider-ytd':key,style:{fontSize:18,fontWeight:600,fontFamily:"'DM Mono',monospace",color:col,marginTop:3}},value))))
  ),
  el('input',{type:'range','aria-label':'All Stores annual Net Sales what-if goal','aria-valuetext':fmtC(target,0),min,max,step,value:target,disabled:locked,onChange:e=>{const value=Number(e.target.value);if(!locked&&Number.isFinite(value)&&value>=min&&value<=max)setTarget(value);},style:{opacity:locked?0.5:1,marginBottom:6}}),
  el('div',{style:{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--t2)',marginBottom:14}},[min,approved,max].map(value=>el('span',{key:value},fmtC(value,0)))),
  !report?el('p',{role:'status'},'No completed reporting day in this financial year yet.'):
   el(React.Fragment,null,
    report.actual==null&&el('p',{role:'status',style:{fontSize:12,color:'var(--amb)'}},'Actuals and variance unavailable: All Stores financial coverage is incomplete. Hypothetical targets remain visible.'),
    el('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}},[
     ['Monthly average',fmtC(report.monthlyAverage,0),'Annual goal ÷ 12; chart uses seasonal targets'],
     ['Weekly average',fmtC(report.weeklyAverage,0),'Flat 52-week planning average'],
     ['Daily average',fmtC(report.dailyAverage,0),'Every calendar day of this '+report.days+'-day financial year'],
     ['Orders per day',report.ordersPerDay==null?'—':report.ordersPerDay.toFixed(1),report.salesPerOrder==null?'Needs complete positive YTD Net Sales and source orders':'At '+fmtC(report.salesPerOrder,2)+' YTD Net Sales per source order'],
    ].map(([label,value,note])=>el('div',{key:label,style:{background:'var(--s2)',border:'1px solid var(--bdr)',borderRadius:'var(--r)',padding:'12px 14px'}},el('div',{className:'lbl'},label),el('div',{style:{fontSize:20,fontWeight:600,fontFamily:"'DM Mono',monospace",margin:'5px 0'}},value),el('div',{style:{fontSize:11,color:'var(--t2)',lineHeight:1.5}},note)))),
    el('p',{style:{fontSize:11,color:'var(--t2)',lineHeight:1.6,marginBottom:0}},'Monthly pacing uses the existing Shopify seasonal shape; it is not separately tuned to marketplace seasonality yet. Orders use each channel’s declared source count, including the provisional NOTHS cohort.'),
    el(GoalBars,{months:report.months})
   )
 );
}
function GoalSliderCard(props){
 const [opened,setOpened]=useState(false);
 return el('details',{className:'card','data-ror-section':'goal-slider',onToggle:e=>{if(e.currentTarget.open)setOpened(true);}},
  el('summary',{style:{cursor:'pointer',color:'var(--amb)',fontWeight:500}},'ROR Total · Explore a Net Sales goal'),
  opened&&el(GoalSliderContent,props));
}
root.RorGoalSliderCard=GoalSliderCard;
})(window);
