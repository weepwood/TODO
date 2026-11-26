import {useEffect,useState} from 'react';
// Fetch only the small search module after idle; never build task entries until opened.
let loaded,pending;
function load(){if(loaded)return Promise.resolve(loaded);return pending??=import('../command-palette.jsx').then(m=>loaded=m.CommandPalette).catch(error=>{pending=null;throw error})}
export function useCommandPalette(open){
 const [Palette,setPalette]=useState(()=>loaded),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(Palette)return;
  let alive=true;
  const start=()=>load().then(component=>{if(alive){setPalette(()=>component);setError(false)}}).catch(()=>{if(alive&&open)setError(true)});
  if(open){start();return()=>{alive=false}}
  const idle=typeof requestIdleCallback==='function'&&typeof cancelIdleCallback==='function',handle=idle?requestIdleCallback(start,{timeout:1500}):setTimeout(start,350);
  return()=>{alive=false;if(idle)cancelIdleCallback(handle);else clearTimeout(handle)};
 },[open,Palette,attempt]);
 return {Palette,error,retry:()=>{setError(false);setAttempt(n=>n+1)}};
}
