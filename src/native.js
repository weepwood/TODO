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
export function useNativeShortcut(uid,callback){useEffect(()=>{if(!native)return;let disposed=false,unlisten;const consume=()=>invoke('native_take_quick_capture',{scope:uid||'guest'}).then(pending=>{if(!disposed&&pending!==null)callback(pending)}).catch(()=>{});listen('todo-quick-add',consume).then(fn=>{if(disposed)fn();else{unlisten=fn;consume()}}).catch(()=>{});return()=>{disposed=true;unlisten?.()}},[uid,callback])}
export function useNativeShortcutStatus(){const [status,setStatus]=useState('unknown');useEffect(()=>{if(!native)return;let alive=true;invoke('native_shortcut_status').then(v=>{if(alive)setStatus(v)}).catch(()=>{});return()=>{alive=false}},[]);return status}
export function useNativeQuit(storage,onError){useEffect(()=>{if(!native||!storage)return;let disposed=false,unlisten;listen('todo-quit-request',async()=>{if(await storage.flush())await invoke('native_exit');else onError('SQLite 保存失败，已取消退出。请重试保存或导出数据。')}).then(fn=>{if(disposed)fn();else unlisten=fn}).catch(()=>{});return()=>{disposed=true;unlisten?.()}},[storage,onError])}

export async function nativeRecoveryPayload(uid){
 const scope=uid||'guest',legacy=scopedStorage(window.localStorage,uid);
 const results=await Promise.allSettled([invoke('native_load_store',{scope}),invoke('native_load',{scope})]);
 return {scope,sqliteStore:results[0].status==='fulfilled'?results[0].value:null,sqliteMirror:results[1].status==='fulfilled'?results[1].value:null,legacy:legacy.getItem(STORAGE_KEY),errors:results.filter(r=>r.status==='rejected').map(r=>String(r.reason))};
}

export function nativeTestNotification(){return invoke("native_test_notification")}

export function nativeOpenCapture(){return invoke('native_open_capture')}

// Main is the only writer. A request remains pending until Rust verifies its
// UUID in the committed SQLite snapshot; retrying cannot append a second task.
export function useDirectCapture({uid,storage,data,blocked,edit,onSaved}){
 const latest=useRef(null);latest.current={data,blocked,edit,onSaved};const inFlight=useRef(false);
 useEffect(()=>{if(!native||!storage?.flush)return;let disposed=false,attempt=null;
 const scope=uid||'guest';const poll=async()=>{if(disposed||inFlight.current)return;inFlight.current=true;
 try{
  if(attempt){
   if(latest.current.blocked)return;
   if(!await storage.flush()||disposed)return;
   if(await invoke('native_direct_ack',{scope,generation:attempt.generation,id:attempt.id})){attempt=null;if(!disposed)latest.current.onSaved();return}
   if(disposed)return;
   // An attempted task is never appended again in this session. If it was
   // undone before the first commit, terminate the outstanding request.
   if(!latest.current.data.tasks.some(t=>t.id===attempt.id)){await invoke('native_direct_cancel_pending',{scope,id:attempt.id});attempt=null;return}
   return;
  }
  const req=await invoke('native_direct_pending',{scope});if(disposed||!req||req.scope!==scope||latest.current.blocked)return;
  if(!latest.current.data.tasks.some(t=>t.id===req.id)){
   const {quickParse}=await import('./advanced.js');const {newTask,dayKey}=await import('./domain.js');
   if(disposed||latest.current.blocked)return;const parsed=quickParse(req.text,dayKey(new Date(req.created_at?req.created_at*1000:Date.now())));if(!parsed.title){await invoke('native_direct_cancel_pending',{scope,id:req.id});return}
   const task={...newTask(parsed.title,'inbox',parsed.date,req.id),time:parsed.time,priority:parsed.priority,...(parsed.points===undefined?{}:{points:parsed.points})};
   attempt=req;latest.current.edit(d=>d.tasks.some(t=>t.id===req.id)?d:{...d,tasks:[...d.tasks,task]});return;
  }
  attempt=req;
 }catch{}finally{inFlight.current=false}};
 const timer=setInterval(poll,1000);poll();return()=>{disposed=true;clearInterval(timer)}},[uid,storage]);
}
