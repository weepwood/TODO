import React,{useLayoutEffect,useRef,useState} from 'react';
import './disclosure.css';
// Keep state for ordinary panels. Task groups may release rows after exit;
// large lists and reduced motion never retain closing rows.
export function Disclosure({open,id,children,className='',unmountOnClose=false,animate=true}) {
 const root=useRef(null),previous=useRef(open),[retained,setRetained]=useState(open);
 useLayoutEffect(()=>{
  const el=root.current,media=matchMedia('(prefers-reduced-motion: reduce)');
  if(!el)return;
  let timer=0;
  const changed=previous.current!==open;previous.current=open;
  const settle=()=>{clearTimeout(timer);delete el.dataset.motionBusy;if(!open)setRetained(false);el.dispatchEvent(new Event('todo-disclosure-settled',{bubbles:true}))};
  if(open)setRetained(true);
  if(!animate||media.matches||!changed){settle();return}
  el.dataset.motionBusy='true';
  // Transition reversal may shorten the native duration; the bounded
  // fallback also handles empty content, interrupted or missing transitions.
  const end=e=>{if(e.target===el&&e.propertyName==='grid-template-rows')settle()};
  const reduce=()=>{if(media.matches)settle()};
  el.addEventListener('transitionend',end);media.addEventListener('change',reduce);
  timer=setTimeout(settle,380);
  return()=>{clearTimeout(timer);el.removeEventListener('transitionend',end);media.removeEventListener('change',reduce);delete el.dataset.motionBusy};
 },[open,animate]);
 return <div ref={root} id={id} className={'shared-disclosure '+className} data-open={open} data-animate={animate}>
  <div className="shared-disclosure-clip" inert={!open?true:undefined} aria-hidden={!open?true:undefined}>{!unmountOnClose||open||(animate&&retained)?children:null}</div>
 </div>;
}
