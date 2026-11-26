import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {initialState,migrateState,STORAGE_KEY} from './core/domain.js';
import {scopedStorage} from './services/cloud-core.js';
import {createNativeActivationCoordinator} from './services/native-activation.js';
import {STORE_KEYS,migrationStore,createNativeStore,attachNativeLifecycle} from './services/native-store.js';
import {native,mobileNative,desktopNative} from './platform/runtime.js';
import {requireMobileNotificationPermission} from './platform/android/notifications.js';
export {native,desktopNative,mobileNative} from './platform/runtime.js';
export {useNativeShortcut,useNativeShortcutStatus,useNativeQuit,nativeOpenCapture,useDirectCapture,useCliOperations} from './platform/desktop/native.jsx';
const nativeActivation=createNativeActivationCoordinator(invoke);
export function useNativeHydration(uid){
 const [result,setResult]=useState({ready:!native,storage:null,error:'',pending:false,saveError:''});
 useEffect(()=>{if(!native)return;let cancelled=false;const scope=uid||'guest',lease=nativeActivation.claim(scope);(async()=>{
  try{
   if(!await lease.ready||cancelled)return;
   const raw=await invoke('native_load_store',{scope});
   if(cancelled)return;
   const legacyStorage=scopedStorage(window.localStorage,uid);
   const legacy={};if(!raw)for(const key of STORE_KEYS){const value=legacyStorage.getItem(key);if(value!==null)legacy[key]=value}
   const mirror=raw?null:await invoke('native_load',{scope});
   if(cancelled||!lease.current())return;
   const values=migrationStore(raw?JSON.parse(raw):null,mirror,legacy);
   if(!values[STORAGE_KEY])values[STORAGE_KEY]=JSON.stringify(initialState());
   // Commit the initial migration before rendering the workspace.
   if(!raw)await invoke('native_write_store',{scope,store:JSON.stringify(values)});
   if(cancelled)return;
   const status=status=>{if(!cancelled)setResult(old=>({...old,pending:status.pending,saveError:status.error}))};
   const storage=import.meta.env.VITE_TODO_R5_LAB==='1'?await (await import('../research/incremental/product-store.mjs')).createProductStore(values,scope,status,invoke):createNativeStore(values,s=>invoke('native_write_store',{scope,store:JSON.stringify(s)}),status,desktopNative?(s,receipt)=>invoke('native_cli_write_store',{scope,store:JSON.stringify(s),receipt}):null);
   const activated=await lease.activate();
   if(!cancelled&&activated)setResult({ready:true,storage,error:'',pending:false,saveError:''});
  }catch(e){if(!cancelled)setResult({ready:true,storage:null,error:String(e),pending:false,saveError:''})}
 })();return()=>{cancelled=true;lease.release().catch(()=>{})}},[uid]);
 return result
}
export function useNativeLifecycle(storage){useEffect(()=>{if(!native||!storage)return;let disposed=false,unlisten;const cleanup=attachNativeLifecycle(storage,document,window);if(!mobileNative)listen('todo-native-pause',()=>{if(!disposed)window.dispatchEvent(new Event('todo-native-pause'))}).then(fn=>{if(disposed)fn();else unlisten=fn}).catch(()=>{});return()=>{disposed=true;cleanup();unlisten?.()}},[storage])}
export async function nativeGuestState(){const raw=await invoke('native_load_store',{scope:'guest'});if(raw)return JSON.parse(raw)[STORAGE_KEY]||null;return window.localStorage.getItem(STORAGE_KEY)||await invoke('native_load',{scope:'guest'})}
export async function nativeNotify(uid,event){if(!native)return;if(mobileNative)await requireMobileNotificationPermission(invoke);return invoke('native_notify',{scope:uid||'guest',taskId:event.taskId,at:event.at,title:event.title})}

export async function nativeRecoveryPayload(uid){
 const scope=uid||'guest',legacy=scopedStorage(window.localStorage,uid);
 const results=await Promise.allSettled([invoke('native_load_store',{scope}),invoke('native_load',{scope})]);
 return {scope,sqliteStore:results[0].status==='fulfilled'?results[0].value:null,sqliteMirror:results[1].status==='fulfilled'?results[1].value:null,legacy:legacy.getItem(STORAGE_KEY),errors:results.filter(r=>r.status==='rejected').map(r=>String(r.reason))};
}

export async function nativeTestNotification(){if(mobileNative)await requireMobileNotificationPermission(invoke,{request:true});return invoke("native_test_notification")}
