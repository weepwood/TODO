import React,{useEffect,useRef,useState} from 'react';
const sections=[['plan','计划'],['organization','属性'],['reminders','提醒'],['notes','备注'],['relations','关联'],['resources','附件'],['activity','记录']];
export function DetailNavigation(){
 const nav=useRef(null),[active,setActive]=useState('plan');
 useEffect(()=>{
  const host=nav.current?.closest('.detail-content');if(!host)return;
  const update=()=>{
   const boundary=nav.current.getBoundingClientRect().bottom+18;
   const items=sections.map(([id])=>host.querySelector('[data-detail-section="'+id+'"]')).filter(Boolean);
   const selected=items.filter(el=>el.getBoundingClientRect().top<=boundary).at(-1)||items[0];
   if(selected)setActive(selected.dataset.detailSection);
  };
  host.addEventListener('scroll',update,{passive:true});update();
  return()=>host.removeEventListener('scroll',update);
 },[]);
 const go=id=>{
  const host=nav.current?.closest('.detail-content'),target=host?.querySelector('[data-detail-section="'+id+'"]');
  if(!target)return;
  setActive(id);
  host.scrollTo({top:host.scrollTop+target.getBoundingClientRect().top-nav.current.getBoundingClientRect().bottom-12,behavior:'instant'});
 };
 return <nav className="detail-navigation" aria-label="任务详情分区" ref={nav}>{sections.map(([id,label])=><button key={id} type="button" aria-current={active===id?'location':undefined} onClick={()=>go(id)}>{label}</button>)}</nav>;
}
