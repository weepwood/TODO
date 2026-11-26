import {useEffect,useState} from 'react';
// Live display belongs to the timer surface, not the application shell.
export function useFocusClock(timer){
 const [now,setNow]=useState(Date.now);
 const running=!!timer&&timer.startedAt!==null;
 useEffect(()=>{
  const tick=()=>setNow(Date.now());
  tick();
  const interval=setInterval(tick,running?1000:60000);
  window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);
  return()=>{clearInterval(interval);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick)};
 },[running,timer]);
 return now;
}
