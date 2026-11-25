import React,{useEffect,useRef,useState} from 'react';
import * as Popover from '@radix-ui/react-popover';
import {useTransientPopover} from '../design-system/popover.js';
import {ChevronRight,ChevronLeft} from 'lucide-react';
export function ScheduleOption({icon:Icon,label,value,onClick,onPointerEnter,expanded,active=false}){
 return <button type="button" className="schedule-option" data-active={active||undefined} onClick={onClick} onPointerEnter={onPointerEnter} aria-expanded={expanded} aria-haspopup={expanded!==undefined?"dialog":undefined} aria-label={label}><Icon size={19}/><span>{label}</span><small>{value}</small><ChevronRight size={16}/></button>
}
export function ScheduleSubpanel({title,onBack,children}){
 return <section className="schedule-subpanel"><button type="button" className="schedule-back" onClick={onBack}><ChevronLeft size={18}/> 返回日期</button><h3>{title}</h3>{children}</section>
}

// The flyout stays mounted while the pointer crosses the gap and while a
// nested date/time/select popover is being used. A sibling hover switches it.
export function useSideSchedule(){
 const query='(min-width: 1120px) and (hover: hover) and (pointer: fine)';
 const [wide,setWide]=useState(()=>matchMedia(query).matches);
 useEffect(()=>{const media=matchMedia(query),change=()=>setWide(media.matches);media.addEventListener('change',change);change();return()=>media.removeEventListener('change',change)},[]);
 return wide;
}
export function ScheduleFlyout({open,onOpenChange,label,option,children}){
 const openedByHover=useRef(false);
 const panel=useRef(null);
 useTransientPopover(open,()=>onOpenChange(false));
 const activate=hover=>{openedByHover.current=hover;if(!open)onOpenChange(true);else if(!hover)panel.current?.focus({preventScroll:true})};
 return <Popover.Root open={open} onOpenChange={onOpenChange} modal={false}>
  <Popover.Anchor asChild><div className="schedule-flyout-anchor">{React.cloneElement(option,{expanded:open,onPointerEnter:e=>{if(e.pointerType==='mouse')activate(true)},onClick:()=>activate(false)})}</div></Popover.Anchor>
  <Popover.Portal><Popover.Content ref={panel} tabIndex={-1} className="schedule-flyout" aria-label={label} side="right" align="start" sideOffset={24} collisionPadding={12} onOpenAutoFocus={e=>{if(openedByHover.current)e.preventDefault()}} onCloseAutoFocus={e=>e.preventDefault()}>
   <div className="schedule-flyout-title">{label}</div>{children}
  </Popover.Content></Popover.Portal>
 </Popover.Root>
}
