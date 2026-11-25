import {useLayoutEffect} from 'react';
import {readScrollMemory,rememberScroll} from '../core/scroll-memory.js';
// Scoped to the actual scroll host. Restore after lazy content mounts; user
// input always wins. Never persist a clamped intermediate restore position.
export function useScrollMemory(ref,storage,key,{enabled=true}={}){
 useLayoutEffect(()=>{
  const host=ref.current;if(!enabled||!host||!storage||!key)return;
  const saved=readScrollMemory(storage),target=Object.hasOwn(saved,key)?saved[key]:0;
  let restoring=true,position=target,dirty=false,timer=0,frame=0,attempt=0,observer;
  const flush=()=>{clearTimeout(timer);if(dirty){rememberScroll(storage,key,position);dirty=false}};
  const stop=()=>{restoring=false;cancelAnimationFrame(frame);observer?.disconnect()};
  const apply=()=>{
   if(!restoring)return;
   host.scrollTop=target;
   if(Math.abs(host.scrollTop-target)<=1||++attempt>=40){position=host.scrollTop;stop()}else frame=requestAnimationFrame(apply);
  };
  const input=()=>{if(restoring){stop();position=host.scrollTop}};
  const scroll=()=>{if(restoring)return;position=host.scrollTop;dirty=true;clearTimeout(timer);timer=setTimeout(flush,160)};
  observer=new MutationObserver(()=>{if(restoring&&Math.abs(host.scrollTop-target)>1){cancelAnimationFrame(frame);frame=requestAnimationFrame(apply)}});
  observer.observe(host,{childList:true,subtree:true});
  host.addEventListener('wheel',input,{passive:true});host.addEventListener('pointerdown',input,{passive:true});host.addEventListener('touchstart',input,{passive:true});host.addEventListener('keydown',input);host.addEventListener('scroll',scroll,{passive:true});window.addEventListener('pagehide',flush);
  apply();
  return()=>{stop();flush();host.removeEventListener('wheel',input);host.removeEventListener('pointerdown',input);host.removeEventListener('touchstart',input);host.removeEventListener('keydown',input);host.removeEventListener('scroll',scroll);window.removeEventListener('pagehide',flush)};
 },[ref,storage,key,enabled]);
}
