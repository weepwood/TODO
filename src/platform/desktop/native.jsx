import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {desktopNative} from '../runtime.js';
export function useNativeShortcut(uid,callback){useEffect(()=>{if(!desktopNative)return;let disposed=false,unlisten;const consume=()=>invoke('native_take_quick_capture',{scope:uid||'guest'}).then(pending=>{if(!disposed&&pending!==null)callback(pending)}).catch(()=>{});listen('todo-quick-add',consume).then(fn=>{if(disposed)fn();else{unlisten=fn;consume()}}).catch(()=>{});return()=>{disposed=true;unlisten?.()}},[uid,callback])}
export function useNativeShortcutStatus(){const [status,setStatus]=useState('unknown');useEffect(()=>{if(!desktopNative)return;let alive=true;invoke('native_shortcut_status').then(v=>{if(alive)setStatus(v)}).catch(()=>{});return()=>{alive=false}},[]);return status}
export function useNativeQuit(storage,onError){useEffect(()=>{if(!desktopNative||!storage)return;let disposed=false,unlisten;listen('todo-quit-request',async()=>{if(await storage.flush())await invoke('native_exit');else onError('SQLite 保存失败，已取消退出。请重试保存或导出数据。')}).then(fn=>{if(disposed)fn();else unlisten=fn}).catch(()=>{});return()=>{disposed=true;unlisten?.()}},[storage,onError])}

export function nativeOpenCapture(){return invoke('native_open_capture')}

// Main is the only writer. A request remains pending until Rust verifies its
// UUID in the committed SQLite snapshot; retrying cannot append a second task.
const requestIds=req=>req.batch_count==null?[req.id]:Array.from({length:req.batch_count},(_,i)=>req.id+":"+(i+1));
export function useDirectCapture({uid,storage,data,blocked,edit,onSaved}){
 const latest=useRef(null);latest.current={data,blocked,edit,onSaved};const inFlight=useRef(false);
 useEffect(()=>{if(!desktopNative||!storage?.flush)return;let disposed=false,attempt=null;
 const scope=uid||'guest';const poll=async()=>{if(disposed||inFlight.current)return;inFlight.current=true;
 try{
  if(attempt){
   if(latest.current.blocked)return;
   if(!await storage.flush()||disposed)return;
   if(await invoke('native_direct_ack',{scope,generation:attempt.generation,id:attempt.id})){attempt=null;if(!disposed)latest.current.onSaved();return}
   if(disposed)return;
   // An attempted task is never appended again in this session. If it was
   // undone before the first commit, terminate the outstanding request.
   if(!requestIds(attempt).every(id=>latest.current.data.tasks.some(t=>t.id===id))){await invoke('native_direct_cancel_pending',{scope,id:attempt.id});attempt=null;return}
   return;
  }
  const req=await invoke('native_direct_pending',{scope});if(disposed||!req||req.scope!==scope||latest.current.blocked)return;
  if(req.batch_count!=null){
   const ids=requestIds(req),present=ids.filter(id=>latest.current.data.tasks.some(t=>t.id===id)).length;
   if(present===ids.length){attempt=req;return}
   if(present){await invoke('native_direct_cancel_pending',{scope,id:req.id});return}
   const {prepareExternalTasks}=await import('../../core/external-capture.js');
   const {appendCapture}=await import('../../core/professional-workflow.js');
   if(disposed||latest.current.blocked)return;
   const make=d=>appendCapture(d,prepareExternalTasks(d,{id:req.id,tasks:JSON.parse(req.text)},new Date(req.created_at*1000)));
   try{if(make(latest.current.data)===latest.current.data)throw Error('invalid batch')}catch{await invoke('native_direct_cancel_pending',{scope,id:req.id});return}
   attempt=req;latest.current.edit(d=>{try{return make(d)}catch{return d}},'device');return;
  }
  if(!latest.current.data.tasks.some(t=>t.id===req.id)){
   const {quickParse}=await import('../../core/advanced.js');const {newTask,dayKey}=await import('../../core/domain.js');
   if(disposed||latest.current.blocked)return;const parsed=quickParse(req.text,dayKey(new Date(req.created_at?req.created_at*1000:Date.now())));if(!parsed.title){await invoke('native_direct_cancel_pending',{scope,id:req.id});return}
   const task={...newTask(parsed.title,'inbox',parsed.date,req.id),time:parsed.time,priority:parsed.priority,...(parsed.points===undefined?{}:{points:parsed.points})};
   attempt=req;latest.current.edit(d=>d.tasks.some(t=>t.id===req.id)?d:{...d,tasks:[...d.tasks,task]});return;
  }
  attempt=req;
 }catch{}finally{inFlight.current=false}};
 const timer=setInterval(poll,1000);poll();return()=>{disposed=true;clearInterval(timer)}},[uid,storage]);
}
