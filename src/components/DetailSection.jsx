import React,{useId,useLayoutEffect,useRef} from 'react';
import {ChevronUp,ChevronDown,GripVertical} from 'lucide-react';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {nextDetailDensity} from '../core/detail-density.js';
import {motion} from '../design-system/motion.js';
export function DetailSection({id,title,icon:Icon,children,meta,density='full',onDensityChange,onMove}){
 const bodyId=useId(),expanded=density==='full';
 const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id});
 const body=useRef(null),animation=useRef(null),previous=useRef(null);
 useLayoutEffect(()=>{
  const el=body.current;if(!el)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const settle=()=>{animation.current?.cancel();animation.current=null;el.hidden=!expanded;el.style.height='';el.style.overflow=''};
  if(previous.current===null||previous.current===expanded||isDragging||media.matches||typeof el.animate!=='function'){settle();previous.current=expanded;return}
  previous.current=expanded;
  const from=el.hidden?0:el.getBoundingClientRect().height;
  animation.current?.cancel();el.hidden=false;el.style.height='';el.style.overflow='hidden';
  const to=expanded?el.getBoundingClientRect().height:0;
  if(Math.abs(from-to)<1){settle();return}
  const a=el.animate([{height:from+'px'},{height:to+'px'}],{duration:motion.panel,easing:motion.ease,fill:'both'});
  animation.current=a;
  a.onfinish=()=>{if(animation.current===a)settle()};
  const change=()=>{if(media.matches)settle()};media.addEventListener('change',change);
  // Sample the animated height before cancelling on the next state change.
  return()=>{media.removeEventListener('change',change)};
 },[expanded,isDragging]);
 useLayoutEffect(()=>()=>{animation.current?.cancel();animation.current=null},[]);
 const ActionIcon=expanded?ChevronUp:ChevronDown;
 return <section ref={setNodeRef} style={{transform:CSS.Translate.toString(transform),transition,opacity:isDragging?.55:undefined}} className="detail-group detail-section-card module-card" data-detail-section={id} data-density={density} data-dragging={isDragging||undefined}>
  <header className="detail-section-heading"><div className="detail-section-title"><button ref={setActivatorNodeRef} {...attributes} {...listeners} type="button" className="icon-button detail-section-drag" aria-label={'拖动 '+title} title={'拖动 '+title+'（方向键移动）'} aria-keyshortcuts="ArrowUp ArrowDown" onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();onMove?.(e.key==='ArrowUp'?-1:1)}}}><GripVertical size={15}/></button><h3><Icon size={16}/>{title}</h3></div><div className="detail-section-header-actions">{meta!=null&&<div className="detail-section-meta">{meta}</div>}{onDensityChange&&<button type="button" className="icon-button detail-section-toggle" aria-label={(expanded?'折叠':'展开')+title} title={expanded?'折叠':'展开'} aria-controls={bodyId} aria-expanded={expanded} onClick={()=>onDensityChange(nextDetailDensity(density))}><ActionIcon size={15}/></button>}</div></header>
  <div ref={body} id={bodyId} className="detail-section-body" inert={!expanded?true:undefined} aria-hidden={!expanded?true:undefined}>{children}</div>
 </section>
}
