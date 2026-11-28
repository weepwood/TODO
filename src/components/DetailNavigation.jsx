import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {springStep} from '../design-system/motion.js';
const sections=[['plan','计划'],['organization','属性'],['notes','备注'],['checklist','检查'],['children','子任务'],['relations','关联'],['resources','附件'],['activity','记录']];
export function DetailNavigation({order=sections.map(([id])=>id),onReveal}){
 const ordered=order.map(id=>sections.find(([key])=>key===id)).filter(Boolean);
 const nav=useRef(null),indicator=useRef(null),spring=useRef(null),revealFrame=useRef(0),[active,setActive]=useState('plan');
 const orderKey=ordered.map(([id])=>id).join('|');
 useLayoutEffect(()=>{
  const host=nav.current,mark=indicator.current;if(!host||!mark)return;
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,last=0,target=null;
  const paint=s=>{mark.style.transform='translateX('+s.x+'px)';mark.style.width=Math.max(0,s.w)+'px';mark.style.top=target.y+'px';mark.style.height=target.h+'px';host.dataset.indicatorReady='true'};
  const snap=()=>{spring.current={x:target.x,w:target.w,vx:0,vw:0};paint(spring.current)};
  const tick=now=>{
   frame=0;if(!target)return;
   const dt=Math.min(Math.max((now-last)/1000,0),.05);last=now;
   const s=spring.current,x=springStep(s.x,s.vx,target.x,dt),w=springStep(s.w,s.vw,target.w,dt);
   spring.current={x:x.position,w:w.position,vx:x.velocity,vw:w.velocity};
   if(Math.abs(x.position-target.x)+Math.abs(w.position-target.w)<.2&&Math.abs(x.velocity)+Math.abs(w.velocity)<1){snap();return}
   paint(spring.current);frame=requestAnimationFrame(tick);
  };
  const measure=()=>{
   const button=host.querySelector('[aria-current="location"]');if(!button||!host.clientWidth)return;
   target={x:button.offsetLeft,y:button.offsetTop,w:button.offsetWidth,h:button.offsetHeight};
   if(!spring.current||media.matches){if(frame)cancelAnimationFrame(frame);frame=0;snap();return}
   if(!frame){last=performance.now();frame=requestAnimationFrame(tick)}
  };
  measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  observer?.observe(host);host.querySelectorAll('button').forEach(button=>observer?.observe(button));
  media.addEventListener('change',measure);
  return()=>{if(frame)cancelAnimationFrame(frame);observer?.disconnect();media.removeEventListener('change',measure)};
 },[active,orderKey]);
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
 useEffect(()=>()=>cancelAnimationFrame(revealFrame.current),[]);
 const go=id=>{
  const host=nav.current?.closest('.detail-content'),target=host?.querySelector('[data-detail-section="'+id+'"]');
  if(!target)return;
  setActive(id);
  onReveal?.(id);
  cancelAnimationFrame(revealFrame.current);revealFrame.current=requestAnimationFrame(()=>{revealFrame.current=0;if(!nav.current||!target.isConnected)return;host.scrollTo({top:host.scrollTop+target.getBoundingClientRect().top-nav.current.getBoundingClientRect().bottom-12,behavior:'instant'})});
 };
 return <nav className="detail-navigation" aria-label="任务详情分区" ref={nav}><span ref={indicator} className="detail-navigation-indicator" aria-hidden="true"/>{ordered.map(([id,label])=><button key={id} type="button" aria-current={active===id?'location':undefined} onClick={()=>go(id)}>{label}</button>)}</nav>;
}
