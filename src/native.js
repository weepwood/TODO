import {useEffect,useRef,useState} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {initialState,migrateState,STORAGE_KEY} from './domain.js';
import {scopedStorage} from './cloud-core.js';
import {STORE_KEYS,migrationStore,createNativeStore} from './native-store.js';
export const native=isTauri();
export function useNativeHydration(uid){
 const [result,setResult]=useState({ready:!native,storage:null,error:'',pending:false,saveError:''});
 useEffect(()=>{if(!native)return;let cancelled=false;const scope=uid||'guest';(async()=>{
  try{
   const raw=await invoke('native_load_store',{scope});
   if(cancelled)return;
   const legacyStorage=scopedStorage(window.localStorage,uid);
   const legacy={};if(!raw)for(const key of STORE_KEYS){const value=legacyStorage.getItem(key);if(value!==null)legacy[key]=value}
   const mirror=raw?null:await invoke('native_load',{scope});
   const values=migrationStore(raw?JSON.parse(raw):null,mirror,legacy);
   if(!values[STORAGE_KEY])values[STORAGE_KEY]=JSON.stringify(initialState());
   // Commit the initial migration before rendering the workspace.
   if(!raw)await invoke('native_write_store',{scope,store:JSON.stringify(values)});
   if(cancelled)return;
   const storage=createNativeStore(values,s=>invoke('native_write_store',{scope,store:JSON.stringify(s)}),status=>{if(!cancelled)setResult(old=>({...old,pending:status.pending,saveError:status.error}))});
   await invoke('native_activate',{scope});
   if(!cancelled)setResult({ready:true,storage,error:'',pending:false,saveError:''});
  }catch(e){if(!cancelled)setResult({ready:true,storage:null,error:String(e),pending:false,saveError:''})}
 })();return()=>{cancelled=true;invoke('native_activate',{scope:null}).catch(()=>{})}},[uid]);
 return result
}
export async function nativeGuestState(){const raw=await invoke('native_load_store',{scope:'guest'});if(raw)return JSON.parse(raw)[STORAGE_KEY]||null;return window.localStorage.getItem(STORAGE_KEY)||await invoke('native_load',{scope:'guest'})}
export function nativeNotify(uid,event){return native?invoke('native_notify',{scope:uid||'guest',taskId:event.taskId,at:event.at,title:event.title}):Promise.resolve()}
export function useNativeShortcut(callback){useEffect(()=>{if(!native)return;let disposed=false,unlisten;listen('todo-quick-add',callback).then(fn=>{if(disposed)fn();else unlisten=fn}).catch(()=>{});return()=>{disposed=true;unlisten?.()}},[callback])}
export function useNativeQuit(storage,onError){useEffect(()=>{if(!native||!storage)return;let disposed=false,unlisten;listen('todo-quit-request',async()=>{if(await storage.flush())await invoke('native_exit');else onError('SQLite 保存失败，已取消退出。请重试保存或导出数据。')}).then(fn=>{if(disposed)fn();else unlisten=fn}).catch(()=>{});return()=>{disposed=true;unlisten?.()}},[storage,onError])}

export async function nativeRecoveryPayload(uid){
 const scope=uid||'guest',legacy=scopedStorage(window.localStorage,uid);
 const results=await Promise.allSettled([invoke('native_load_store',{scope}),invoke('native_load',{scope})]);
 return {scope,sqliteStore:results[0].status==='fulfilled'?results[0].value:null,sqliteMirror:results[1].status==='fulfilled'?results[1].value:null,legacy:legacy.getItem(STORAGE_KEY),errors:results.filter(r=>r.status==='rejected').map(r=>String(r.reason))};
}
