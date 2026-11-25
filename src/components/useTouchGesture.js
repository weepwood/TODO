import {useEffect,useRef,useState} from 'react';
import {gestureAxis,gestureAction,gestureOffset} from '../core/touch-gesture.js';
const idle={offset:0,phase:'idle',release:0};
export function useTouchGesture({enabled=true,kind='row',onAction,onHold}){
 const active=useRef(null),timer=useRef(null),frame=useRef(null),pending=useRef(idle),suppressUntil=useRef(0),[visual,setVisual]=useState(idle);
 const cancelTimer=()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null}};
 const cancelFrame=()=>{if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null}};
 const paint=(next,immediate=false)=>{pending.current=next;if(immediate){cancelFrame();setVisual(next);return}if(frame.current===null)frame.current=requestAnimationFrame(()=>{frame.current=null;setVisual(pending.current)})};
 const reset=()=>{cancelTimer();active.current=null;paint(idle,true)};
 useEffect(()=>()=>{clearTimeout(timer.current);if(frame.current!==null)cancelAnimationFrame(frame.current)},[]);
 // Keep the release position while Radix plays its closed-state animation.
 useEffect(()=>{cancelTimer();active.current=null;cancelFrame();if(enabled)paint(idle,true)},[enabled]);
 const start=e=>{
  reset();if(!enabled||e.touches.length!==1||kind!=='row'&&e.target.closest('button,input,textarea,a,[role=button]'))return;
  // A new valid touch owns its own click; only the preceding gesture's synthetic click is suppressed.
  suppressUntil.current=0;
  const t=e.touches[0],a={x:t.clientX,y:t.clientY,axis:null,held:false,moved:false};active.current=a;
  if(onHold)timer.current=setTimeout(()=>{if(active.current===a&&!a.axis&&!a.moved){a.held=true;paint({offset:0,phase:'held',release:0},true)}},500);
 };
 const move=e=>{
  const a=active.current;if(!a||e.touches.length!==1){if(a)suppressUntil.current=Date.now()+700;reset();return}
  const t=e.touches[0],dx=t.clientX-a.x,dy=t.clientY-a.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))>=8){cancelTimer();a.held=false;a.moved=true}
  a.axis=a.axis||gestureAxis(dx,dy);
  if(a.held)return;
  const offset=gestureOffset(dx,dy,a.axis,kind);
  paint({offset,phase:offset?'dragging':'idle',release:0});
 };
 const end=e=>{
  const a=active.current;cancelTimer();active.current=null;
  if(!a||e.changedTouches.length!==1){reset();return}
  const t=e.changedTouches[0],dx=t.clientX-a.x,dy=t.clientY-a.y,axis=a.axis||gestureAxis(dx,dy);
  const action=gestureAction(dx,dy,axis,kind),hold=a.held&&!a.moved&&Math.max(Math.abs(dx),Math.abs(dy))<8;
  if(hold||action||a.moved||Math.max(Math.abs(dx),Math.abs(dy))>=10){
   if(e.cancelable)e.preventDefault();suppressUntil.current=Date.now()+700;
  }
  const release=action==='dismiss'?gestureOffset(dx,dy,axis,kind):0;
  paint({offset:0,phase:release?'dismiss':'idle',release},true);
  if(hold)onHold?.();else if(action)onAction?.(action);
 };
 const cancel=()=>{if(active.current)suppressUntil.current=Date.now()+700;reset()};
 return {...visual,handlers:{onTouchStart:start,onTouchMove:move,onTouchEnd:end,onTouchCancel:cancel},suppressClick:()=>Date.now()<suppressUntil.current};
}
