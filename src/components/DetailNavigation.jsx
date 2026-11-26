import React,{useEffect,useRef,useState} from 'react';
const sections=[['plan','计划'],['organization','属性'],['notes','备注'],['checklist','检查'],['children','子任务'],['relations','关联'],['resources','附件'],['activity','记录']];
export function DetailNavigation({order=sections.map(([id])=>id),onReveal}){
 const ordered=order.map(id=>sections.find(([key])=>key===id)).filter(Boolean);
 const nav=useRef(null),[active,setActive]=useState('plan');
 useEffect(()=>{
  const host=nav.current?.closest('.detail-content');if(!host)return;
  const update=()=>{
   const boundary=nav.current.getBoundingClientRect().bottom+18;
   const items=ordered.map(([id])=>host.querySelector('[data-detail-section="'+id+'"]')).filter(Boolean);
   const selected=items.filter(el=>el.getBoundingClientRect().top<=boundary).at(-1)||items[0];
   if(selected)setActive(selected.dataset.detailSection);
  };
  let frame=0;const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;update()})};
  host.addEventListener('scroll',schedule,{passive:true});const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedule):null;host.querySelectorAll('[data-detail-section]').forEach(el=>observer?.observe(el));update();
  return()=>{host.removeEventListener('scroll',schedule);observer?.disconnect();if(frame)cancelAnimationFrame(frame)};

 },[order]);
 useEffect(()=>{
  const el=nav.current?.querySelector('[aria-current="location"]'),host=nav.current;if(!el||!host)return;
  const a=el.getBoundingClientRect(),b=host.getBoundingClientRect();if(a.left<b.left)host.scrollLeft+=a.left-b.left;else if(a.right>b.right)host.scrollLeft+=a.right-b.right;
 },[active]);
 const go=id=>{
  const host=nav.current?.closest('.detail-content'),target=host?.querySelector('[data-detail-section="'+id+'"]');
  if(!target)return;
  setActive(id);
  onReveal?.(id);
  requestAnimationFrame(()=>{if(!nav.current||!target.isConnected)return;host.scrollTo({top:host.scrollTop+target.getBoundingClientRect().top-nav.current.getBoundingClientRect().bottom-12,behavior:'instant'})});
 };
 return <nav className="detail-navigation" aria-label="任务详情分区" ref={nav}>{ordered.map(([id,label])=><button key={id} type="button" aria-current={active===id?'location':undefined} onClick={()=>go(id)}>{label}</button>)}</nav>;
}
