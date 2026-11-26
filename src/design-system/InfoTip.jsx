import React,{useEffect,useLayoutEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Info} from 'lucide-react';
import {useTransientPopover} from './popover.js';

// Supplementary help only. Never transfer focus into a noninteractive tooltip.
export function InfoTip({label='说明',children}){
 const [open,setOpen]=useState(false),tipId=useId(),timer=useRef(null),pointer=useRef(''),anchor=useRef(null),tip=useRef(null);
 const clear=()=>{clearTimeout(timer.current);timer.current=null};
 const show=()=>{clear();setOpen(true)};
 const hide=()=>{clear();setOpen(false)};
 const leave=()=>{clear();timer.current=setTimeout(()=>setOpen(false),180)};
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 useTransientPopover(open,hide);
 useLayoutEffect(()=>{
  if(!open)return;
  function position(){
   const a=anchor.current,b=tip.current;if(!a||!b)return;
   const r=a.getBoundingClientRect(),w=b.offsetWidth,h=b.offsetHeight;
   b.style.left=Math.max(12,Math.min(window.innerWidth-w-12,r.right-w))+'px';
   b.style.top=Math.max(12,Math.min(window.innerHeight-h-12,r.top>=h+18?r.top-h-6:r.bottom+6))+'px';
  }
  function outside(e){if(!anchor.current?.contains(e.target)&&!tip.current?.contains(e.target))hide()}
  function escape(e){if(e.key==='Escape'){e.stopPropagation();hide()}}
  position();window.addEventListener('resize',position);window.addEventListener('scroll',position,true);document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);
  return()=>{window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true)};
 },[open]);
 return <><button ref={anchor} type="button" className="info-tip-trigger" aria-label={label} aria-describedby={open?tipId:undefined} aria-expanded={open}
   onPointerEnter={e=>{if(e.pointerType==='mouse')show()}} onPointerLeave={e=>{if(e.pointerType==='mouse')leave()}}
   onPointerDown={e=>{pointer.current=e.pointerType}} onFocus={e=>{if(pointer.current!=='touch'||e.currentTarget.matches(':focus-visible'))show()}} onBlur={hide}
   onClick={e=>{if(e.detail===0||pointer.current!=='mouse'){if(open)hide();else show()}else show()}}><Info size={14} aria-hidden="true"/></button>
  {open&&createPortal(<div ref={tip} id={tipId} role="tooltip" className="info-tip-content" onPointerEnter={clear} onPointerLeave={e=>{if(e.pointerType==='mouse')leave()}}>{children}</div>,document.body)}</>
}
