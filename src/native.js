import {useEffect,useRef,useState} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {migrateState,STORAGE_KEY} from './domain.js';
import {scopedStorage,canonical} from './cloud-core.js';
export const native=isTauri();
export function useNativeHydration(uid){
 const [ready,setReady]=useState(!native);
 const [error,setError]=useState('');
 useEffect(()=>{if(!native)return;let cancelled=false;const scope=uid||'guest';(async()=>{
  try{const storage=scopedStorage(window.localStorage,uid);const raw=await invoke('native_load',{scope});if(cancelled)return;if(raw&&!storage.getItem(STORAGE_KEY))storage.setItem(STORAGE_KEY,JSON.stringify(migrateState(JSON.parse(raw))));await invoke('native_activate',{scope});}
  catch(e){if(!cancelled)setError(String(e))}
  finally{if(!cancelled)setReady(true)}
 })();return()=>{cancelled=true;invoke('native_activate',{scope:null}).catch(()=>{})}},[uid]);
 return {ready,error}
}
export function useNativePersistence(uid,data,blocked){
 const [error,setError]=useState('');
 const queue=useRef(Promise.resolve()),last=useRef(null);
 useEffect(()=>{if(!native||blocked)return;const scope=uid||'guest',body=JSON.stringify(data);if(last.current===body)return;last.current=body;queue.current=queue.current.catch(()=>{}).then(()=>invoke('native_save',{scope,body})).then(()=>setError('')).catch(e=>{last.current=null;setError(String(e))})},[uid,data,blocked]);
 return error
}
export function nativeNotify(uid,event){return native?invoke('native_notify',{scope:uid||'guest',taskId:event.taskId,at:event.at,title:event.title}):Promise.resolve()}
export function useNativeShortcut(callback){useEffect(()=>{if(!native)return;let disposed=false,unlisten;listen('todo-quick-add',callback).then(fn=>{if(disposed)fn();else unlisten=fn}).catch(()=>{});return()=>{disposed=true;unlisten?.()}},[callback])}
