import {motion} from "../design-system/motion.js";
import {useLayoutEffect,useRef} from 'react';

// Cards may remount in another lane. Keep their last layout position and the
// current visual offset, so a second move starts from the visible location.
export function useBoardMotion(ref,{scope,order,enabled}){
 const previous=useRef(null),running=useRef(new Map());
 const cancel=()=>{for(const {animation} of running.current.values())animation.cancel();running.current.clear()};
 const snapshot=host=>{
  const cards=[...host.querySelectorAll('[data-board-task]')].filter(el=>el.getClientRects().length);
  if(cards.length>80)return null;
  const origin=host.getBoundingClientRect();
  return {scope,width:host.clientWidth,positions:new Map(cards.map(el=>{
   const rect=el.getBoundingClientRect();
   return [el.dataset.boardTask,{el,x:rect.left-origin.left,y:rect.top-origin.top,lane:el.closest('[data-lane-key]')?.dataset.laneKey}];
  }))};
 };
 useLayoutEffect(()=>{
  const host=ref.current;
  if(!host||!enabled||matchMedia('(prefers-reduced-motion: reduce)').matches){cancel();previous.current=null;return}
  const old=previous.current,offsets=new Map();
  for(const [id,{animation,x,y}] of running.current){
   const progress=animation.effect?.getComputedTiming().progress;
   if(progress!==null&&progress!==undefined)offsets.set(id,{x:x*(1-progress),y:y*(1-progress)});
  }
  cancel();
  const next=snapshot(host);previous.current=next;
  if(!old||!next||old.scope!==scope||old.width!==next.width)return;
  for(const [id,p] of next.positions){
   const before=old.positions.get(id);if(!before)continue;
   const offset=offsets.get(id);
   if(before.lane===p.lane&&!offset)continue;
   const x=before.x-p.x+(offset?.x||0),y=before.y-p.y+(offset?.y||0);
   if(Math.hypot(x,y)<2||Math.abs(x)>host.clientWidth||Math.abs(y)>480||typeof p.el.animate!=='function')continue;
   const animation=p.el.animate([{translate:x+'px '+y+'px'},{translate:'0px 0px'}],{duration:motion.reorder,easing:motion.ease});
   running.current.set(id,{animation,x,y});
   animation.onfinish=()=>{if(running.current.get(id)?.animation===animation)running.current.delete(id)};
  }
 },[ref,scope,order,enabled]);
 useLayoutEffect(()=>{
  const host=ref.current;
  if(!host||!enabled)return;
  let width=host.clientWidth;
  const observer=new ResizeObserver(()=>{
   if(width===host.clientWidth)return;
   width=host.clientWidth;cancel();
   previous.current=matchMedia('(prefers-reduced-motion: reduce)').matches?null:snapshot(host);
  });
  observer.observe(host);return()=>observer.disconnect();
 },[ref,scope,order,enabled]);
 useLayoutEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const clear=()=>{cancel();previous.current=null};
  const changed=()=>{if(media.matches)clear()};
  media.addEventListener('change',changed);
  return()=>{media.removeEventListener('change',changed);clear()}
 },[]);
}
