import {useEffect,useRef,useState} from 'react';
import {gestureAxis,gestureAction} from '../core/touch-gesture.js';
export function useTouchGesture({enabled=true,kind='row',onAction,onHold}){
 const active=useRef(null),timer=useRef(null),suppressUntil=useRef(0),[offset,setOffset]=useState(0);
 const cancelTimer=()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null}};
 const reset=()=>{cancelTimer();active.current=null;setOffset(0)};
 useEffect(()=>()=>{clearTimeout(timer.current)},[]);
 useEffect(()=>{if(!enabled){cancelTimer();active.current=null;setOffset(0)}},[enabled]);
 const start=e=>{
  reset();if(!enabled||e.touches.length!==1)return;
  const t=e.touches[0],a={x:t.clientX,y:t.clientY,axis:null,held:false};active.current=a;
  if(onHold)timer.current=setTimeout(()=>{if(active.current===a&&!a.axis){a.held=true}},500);
 };
 const move=e=>{
  const a=active.current;if(!a||e.touches.length!==1){reset();return}
  const t=e.touches[0],dx=t.clientX-a.x,dy=t.clientY-a.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))>=8){cancelTimer();a.held=false}
  a.axis=a.axis||gestureAxis(dx,dy);
  if(a.held)return;
  if(kind==='row'&&a.axis==='x')setOffset(Math.max(-64,Math.min(0,dx*.55)));
  if(kind==='sheet'&&a.axis==='y')setOffset(Math.max(0,Math.min(100,dy*.5)));
 };
 const end=e=>{
  const a=active.current;reset();if(!a||e.changedTouches.length!==1)return;
  if(a.held){if(e.cancelable)e.preventDefault();suppressUntil.current=Date.now()+700;onHold?.();return}
  const t=e.changedTouches[0],dx=t.clientX-a.x,dy=t.clientY-a.y,axis=a.axis||gestureAxis(dx,dy);
  const action=gestureAction(dx,dy,axis,kind);
  if(action){if(e.cancelable)e.preventDefault();suppressUntil.current=Date.now()+700;onAction?.(action)}
 };
 return {offset,handlers:{onTouchStart:start,onTouchMove:move,onTouchEnd:end,onTouchCancel:reset},suppressClick:()=>Date.now()<suppressUntil.current};
}
