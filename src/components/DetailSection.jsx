import React,{useId} from 'react';
import {ChevronUp,ChevronDown,GripVertical} from 'lucide-react';
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {nextDetailDensity} from '../core/detail-density.js';
export function DetailSection({id,title,icon:Icon,children,meta,density='full',onDensityChange,onMove}){
 const bodyId=useId(),expanded=density==='full';
 const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id});
 const ActionIcon=expanded?ChevronUp:ChevronDown;
 return <section ref={setNodeRef} style={{transform:CSS.Translate.toString(transform),transition,opacity:isDragging?.55:undefined}} className="detail-group detail-section-card" data-detail-section={id} data-density={density} data-dragging={isDragging||undefined}>
  <header className="detail-section-heading"><div className="detail-section-title"><button ref={setActivatorNodeRef} {...attributes} {...listeners} type="button" className="icon-button detail-section-drag" aria-label={'拖动 '+title} title={'拖动 '+title+'（方向键移动）'} aria-keyshortcuts="ArrowUp ArrowDown" onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();onMove?.(e.key==='ArrowUp'?-1:1)}}}><GripVertical size={15}/></button><h3><Icon size={16}/>{title}</h3></div><div className="detail-section-header-actions">{meta!=null&&<div className="detail-section-meta">{meta}</div>}{onDensityChange&&<button type="button" className="icon-button detail-section-toggle" aria-label={(expanded?'折叠':'展开')+title} title={expanded?'折叠':'展开'} aria-controls={bodyId} aria-expanded={expanded} onClick={()=>onDensityChange(nextDetailDensity(density))}><ActionIcon size={15}/></button>}</div></header>
  <div id={bodyId} className="detail-section-body" hidden={!expanded} inert={!expanded?true:undefined}>{children}</div>
 </section>
}
