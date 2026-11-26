import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {native} from './native.js';
export function useNativeSearch({uid,query,tasks,pending}){
 const [result,setResult]=useState(null);
 useEffect(()=>{setResult(null);if(!native||pending||!query.trim())return;let active=true;
 const delay=setTimeout(()=>invoke('native_search',{scope:uid||'guest',query:query.trim()}).then(ids=>{if(active&&Array.isArray(ids))setResult({tasks,query,ids:new Set(ids)})}).catch(()=>{if(active)setResult(null)}),120);
 return()=>{active=false;clearTimeout(delay)}
 },[uid,query,tasks,pending]);
 return !pending&&result?.query===query&&result.tasks===tasks?result.ids:null;
}
