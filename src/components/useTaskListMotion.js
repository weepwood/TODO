import {motion} from "../design-system/motion.js";
import {useLayoutEffect,useRef} from 'react';

// Measure layout coordinates, excluding animated translations and drag transforms.
function layoutY(node){
 let y=0;
 for(let el=node;el;el=el.offsetParent)y+=el.offsetTop;
 return y;
}
export function useTaskListMotion(container,{scope,order,enabled,layoutKey}){
 const previous=useRef(null),running=useRef(new Map());
 const stop=()=>{for(const animation of running.current.values())animation.cancel();running.current.clear()};
 const snapshot=host=>{
  const rows=[...host.querySelectorAll('.task-row[data-row-id]')];
  if(rows.length>80||rows.some(row=>row.dataset.dragging==='true'||(row.style.transform&&row.style.transform!=='none')))return null;
  const origin=layoutY(host);
  return {scope,order,width:host.clientWidth,positions:new Map(rows.map(row=>[row.dataset.rowId,{row,y:layoutY(row)-origin}]))};
 };
 useLayoutEffect(()=>{
  const host=container.current;
  if(!host||!enabled||matchMedia('(prefers-reduced-motion: reduce)').matches){stop();previous.current=null;return}
  const old=previous.current,next=snapshot(host);
  previous.current=next;
  if(!next||!old||old.scope!==scope||old.width!==next.width){stop();return}
  if(old.order===order)return;
  // An interrupted animation contributes its current visual offset, not its old start.
  const offsets=new Map();
  for(const [id,animation] of running.current){
   const row=next.positions.get(id)?.row;
   if(row&&animation.playState==='running')offsets.set(id,parseFloat((getComputedStyle(row).translate||'').split(' ')[1])||0);
  }
  stop();
  for(const [id,{row,y}] of next.positions){
   const before=old.positions.get(id);if(!before)continue;
   const delta=before.y-y+(offsets.get(id)||0);
   if(Math.abs(delta)<2||Math.abs(delta)>240||typeof row.animate!=='function')continue;
   const animation=row.animate([{translate:'0 '+delta+'px'},{translate:'0 0px'}],{duration:motion.reorder,easing:motion.ease});
   running.current.set(id,animation);
   animation.onfinish=()=>{if(running.current.get(id)===animation)running.current.delete(id)};
  }
 },[container,scope,order,enabled,layoutKey]);
 useLayoutEffect(()=>{
  const host=container.current;
  if(!host||!enabled)return;
  let width=host.clientWidth;
  const observer=new ResizeObserver(()=>{
   if(host.clientWidth===width)return;
   width=host.clientWidth;stop();
   previous.current=matchMedia('(prefers-reduced-motion: reduce)').matches?null:snapshot(host);
  });
  observer.observe(host);
  return()=>observer.disconnect();
 },[container,scope,order,enabled,layoutKey]);
 useLayoutEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const change=()=>{if(media.matches){stop();previous.current=null}};
  media.addEventListener('change',change);
  return()=>{media.removeEventListener('change',change);stop();previous.current=null}
 },[]);
}
