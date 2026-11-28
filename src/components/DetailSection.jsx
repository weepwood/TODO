import React,{useId,useLayoutEffect,useRef} from 'react';
import {ChevronUp,ChevronDown,GripVertical} from 'lucide-react';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {nextDetailDensity} from '../core/detail-density.js';
import {springStep} from '../design-system/motion.js';
export function DetailSection({id,title,icon:Icon,children,meta,density='full',onDensityChange,onMove}){
 const bodyId=useId(),expanded=density==='full';
 const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id});
 const body=useRef(null),frame=useRef(0),state=useRef(null),previous=useRef(null);
 useLayoutEffect(()=>{
  const el=body.current;if(!el)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const stop=()=>{cancelAnimationFrame(frame.current);frame.current=0};
  const settle=()=>{stop();state.current=null;el.hidden=!expanded;el.style.height='';el.style.overflow=''};
  if(previous.current===null||previous.current===expanded||isDragging||media.matches){settle();previous.current=expanded;return}
  previous.current=expanded;
  const from=el.hidden?0:el.getBoundingClientRect().height;
  const velocity=state.current?.velocity||0;
  stop();el.hidden=false;el.style.height='';el.style.overflow='hidden';
  const target=expanded?el.getBoundingClientRect().height:0;
  if(Math.abs(from-target)<.08&&Math.abs(velocity)<.8){settle();return}
  state.current={position:from,velocity};
  el.style.height=from+'px';
  let last=performance.now();
  const tick=now=>{
   const dt=Math.max(0,(now-last)/1000);last=now;
   let next=springStep(state.current.position,state.current.velocity,target,dt,21);
   if(next.position<0)next={position:0,velocity:Math.max(0,next.velocity)};
   state.current=next;el.style.height=next.position+'px';
   if(Math.abs(next.position-target)<.08&&Math.abs(next.velocity)<.8){settle();return}
   frame.current=requestAnimationFrame(tick);
  };
  frame.current=requestAnimationFrame(tick);
  const change=()=>{if(media.matches)settle()};media.addEventListener('change',change);
  return()=>{stop();media.removeEventListener('change',change)};
 },[expanded,isDragging]);
 useLayoutEffect(()=>()=>{cancelAnimationFrame(frame.current);frame.current=0;state.current=null},[]);
 const ActionIcon=expanded?ChevronUp:ChevronDown;
 return <section ref={setNodeRef} style={{transform:CSS.Translate.toString(transform),transition,opacity:isDragging?.55:undefined}} className="detail-group detail-section-card module-card" data-detail-section={id} data-density={density} data-dragging={isDragging||undefined}>
  <header className="detail-section-heading"><div className="detail-section-title"><button ref={setActivatorNodeRef} {...attributes} {...listeners} type="button" className="icon-button detail-section-drag" aria-label={'拖动 '+title} title={'拖动 '+title+'（方向键移动）'} aria-keyshortcuts="ArrowUp ArrowDown" onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();onMove?.(e.key==='ArrowUp'?-1:1)}}}><GripVertical size={15}/></button><h3><Icon size={16}/>{title}</h3></div><div className="detail-section-header-actions">{meta!=null&&<div className="detail-section-meta">{meta}</div>}{onDensityChange&&<button type="button" className="icon-button detail-section-toggle" aria-label={(expanded?'折叠':'展开')+title} title={expanded?'折叠':'展开'} aria-controls={bodyId} aria-expanded={expanded} onClick={()=>onDensityChange(nextDetailDensity(density))}><ActionIcon size={15}/></button>}</div></header>
  <div ref={body} id={bodyId} className="detail-section-body" inert={!expanded?true:undefined} aria-hidden={!expanded?true:undefined}><div className="detail-section-inner">{children}</div></div>
 </section>
}
