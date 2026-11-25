import {useLayoutEffect,useRef} from 'react';

// Animate only already-mounted rows in small, non-virtual lists.
// Independent CSS translate leaves dnd-kit's transform untouched.
export function useTaskListMotion(container,{scope,order,enabled}){
 const previous=useRef(null),running=useRef(new Map());
 useLayoutEffect(()=>{
  const host=container.current;
  const cancel=()=>{for(const animation of running.current.values())animation.cancel();running.current.clear()};
  if(!host||!enabled||matchMedia('(prefers-reduced-motion: reduce)').matches){cancel();previous.current=null;return}
  const rows=[...host.querySelectorAll('.task-row[data-row-id]')];
  if(rows.length>80||rows.some(row=>row.dataset.dragging==='true'||row.style.transform)){cancel();previous.current=null;return}
  const origin=host.getBoundingClientRect(),old=previous.current;
  cancel();
  const next=new Map(rows.map(row=>[row.dataset.rowId,{row,y:row.getBoundingClientRect().top-origin.top+host.scrollTop}]));
  previous.current={scope,width:host.clientWidth,positions:next};
  if(!old||old.scope!==scope||old.width!==host.clientWidth)return;
  for(const [id,{row,y}] of next){
   const before=old.positions.get(id);if(!before)continue;
   const delta=before.y-y;
   if(Math.abs(delta)<2||Math.abs(delta)>240||typeof row.animate!=='function')continue;
   const animation=row.animate([{translate:'0 '+delta+'px'},{translate:'0 0px'}],{duration:180,easing:'cubic-bezier(.2,.75,.25,1)'});
   running.current.set(id,animation);
   animation.onfinish=()=>{if(running.current.get(id)===animation)running.current.delete(id)};
  }
 },[container,scope,order,enabled]);
 useLayoutEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const stop=()=>{for(const animation of running.current.values())animation.cancel();running.current.clear();previous.current=null};
  const change=()=>{if(media.matches)stop()};
  media.addEventListener('change',change);
  return()=>{media.removeEventListener('change',change);stop()}
 },[]);
}
