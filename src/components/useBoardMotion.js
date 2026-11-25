import {useLayoutEffect,useRef} from 'react';

// Cards may remount when they enter a different column. Match by task identity,
// not DOM identity. Only explicit column changes animate, not filters/resizes.
export function useBoardMotion(ref,{scope,order,enabled}){
 const previous=useRef(null),running=useRef(new Map());
 const cancel=()=>{for(const a of running.current.values())a.cancel();running.current.clear()};
 useLayoutEffect(()=>{
  const host=ref.current;
  if(!host||!enabled||matchMedia('(prefers-reduced-motion: reduce)').matches){cancel();previous.current=null;return}
  const cards=[...host.querySelectorAll('[data-board-task]')].filter(el=>el.getClientRects().length);
  if(cards.length>80){cancel();previous.current=null;return}
  const origin=host.getBoundingClientRect(),old=previous.current;
  cancel();
  const positions=new Map(cards.map(el=>{
   const rect=el.getBoundingClientRect();
   return [el.dataset.boardTask,{el,x:rect.left-origin.left,y:rect.top-origin.top,lane:el.closest('[data-lane-key]')?.dataset.laneKey}];
  }));
  previous.current={scope,width:host.clientWidth,positions};
  if(!old||old.scope!==scope||old.width!==host.clientWidth)return;
  for(const [id,p] of positions){
   const before=old.positions.get(id);if(!before||before.lane===p.lane)continue;
   const x=before.x-p.x,y=before.y-p.y;
   if(Math.abs(x)>host.clientWidth||Math.abs(y)>480||typeof p.el.animate!=='function')continue;
   const a=p.el.animate([{translate:x+'px '+y+'px',opacity:.85},{translate:'0px 0px',opacity:1}],{duration:200,easing:'cubic-bezier(.2,.75,.25,1)'});
   running.current.set(id,a);
   a.onfinish=()=>{if(running.current.get(id)===a)running.current.delete(id)};
  }
 },[ref,scope,order,enabled]);
 useLayoutEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const clear=()=>{cancel();previous.current=null};
  const changed=()=>{if(media.matches)clear()};
  media.addEventListener('change',changed);
  return()=>{media.removeEventListener('change',changed);clear()}
 },[]);
}
