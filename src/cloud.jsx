import {assertCloudCapacity,requireCommittedStorage,prepareSyncSnapshot} from './services/sync-durability.js';
import {unsafeSeriesPull} from './core/series-control.js';
import {subscribeSyncWake} from './platform/web/sync-wake.js';
import {mobileNative,androidNative} from './platform/runtime.js';
import {invoke} from '@tauri-apps/api/core';
import {ANDROID_SESSION_KEY,createAndroidSessionStorage} from './platform/android/session-storage.js';
import React,{useEffect,useRef,useState,useCallback} from 'react';
import {createClient} from '@supabase/supabase-js';
import {CLOUD_URL,CLOUD_KEY} from './cloud-config.js';
import {initialState,migrateState,readState,saveState,STORAGE_KEY} from './core/domain.js';
import {mergeTasks,resolveTaskFields,saveBaseline,loadBaseline,unsafeHistoryPull} from './services/sync-merge.js';
import {buildTaskDelta,replayTaskDeltas} from './services/task-delta.js';
import {appendSyncLog,readSyncLog,SYNC_LOG_KEY} from './services/sync-diagnostics.js';
import {scopedStorage,canonical,digest,readMeta,META_KEY,decideSync,readRemote,preserveConflict} from './services/cloud-core.js';
// Android credentials live only in the native encrypted vault. Other platforms
// retain their existing session behavior; unsupported native mobile is memory-only.
export const cloud=createClient(CLOUD_URL,CLOUD_KEY,{auth:{persistSession:!mobileNative||androidNative,autoRefreshToken:true,detectSessionInUrl:!mobileNative,...(androidNative?{storageKey:ANDROID_SESSION_KEY,storage:createAndroidSessionStorage(invoke)}:{})}});
const TABLE='todo_workspaces';
export function useAccount(){
 const [session,setSession]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;const {data:{subscription}}=cloud.auth.onAuthStateChange((event,s)=>{if(active){setSession(s);setReady(true)}});cloud.auth.getSession().then(({data,error})=>{if(active){if(error)setError(error.message);else setSession(data.session);setReady(true)}}).catch(e=>{if(active){setError(e.message);setReady(true)}});return()=>{active=false;subscription.unsubscribe()}},[]);
 return {session,ready,error}
}
export function useAccountLock(uid){
 const [state,setState]=useState(uid?'loading':'ready');
 useEffect(()=>{if(!uid){setState('ready');return}if(!navigator.locks){setState('unsupported');return}let cancelled=false,release;const hold=new Promise(r=>release=r);navigator.locks.request('todo-account-'+uid,{ifAvailable:true},async lock=>{if(cancelled)return;setState(lock?'ready':'busy');if(lock)await hold}).catch(()=>{if(!cancelled)setState('unsupported')});return()=>{cancelled=true;release()}},[uid]);
 return state
}
async function getRow(uid,meta,base){
 if(meta&&base){
  const {data,error}=await cloud.from(TABLE).select('revision,updated_at').eq('user_id',uid).abortSignal(AbortSignal.timeout(12000)).maybeSingle();
  if(error)throw error;
  if(!data)return null;
  if(data.revision===meta.revision)return {...data,state:base};
  if(data.revision>meta.revision){
   try{
    const {data:result,error:deltaError}=await cloud.rpc('todo_read_task_deltas',{p_revision:meta.revision}).abortSignal(AbortSignal.timeout(12000));
    if(!deltaError){const state=replayTaskDeltas(base,meta.revision,result);if(state&&result.revision>=data.revision){const valid=migrateState(state);if(canonical(valid)===canonical(state))return {revision:result.revision,updated_at:result.updated_at,state:valid,mode:'delta'}}}
   }catch{/* missing RPC, gap or invalid data: use the authoritative full row */}
  }

 }
 const {data,error}=await cloud.from(TABLE).select('revision,state,updated_at').eq('user_id',uid).abortSignal(AbortSignal.timeout(12000)).maybeSingle();if(error)throw error;return readRemote(data)}
async function writeRow(uid,state,revision,remoteState){
 assertCloudCapacity(state);
 const delta=revision!==null?buildTaskDelta(remoteState,state):null;
 if(delta){
  const {data,error}=await cloud.rpc('todo_apply_task_delta',{p_revision:revision,p_tasks:delta}).abortSignal(AbortSignal.timeout(12000));
  if(!error)return data?{...data,mode:'delta'}:null;
  if(error.code==='40001')return null;
  // Alternate Supabase deployments may not yet have the migration.
  if(!['PGRST202','42883'].includes(error.code))throw error;
 }
 const q=revision===null?cloud.from(TABLE).insert({user_id:uid,state,revision:1}):cloud.from(TABLE).update({state,revision:revision+1}).eq('user_id',uid).eq('revision',revision);
 const {data,error}=await q.select('revision,updated_at').abortSignal(AbortSignal.timeout(12000)).maybeSingle();
 if(error){if(error.code==='23505'||error.code==='40001')return null;throw error}return data
}
export function useWorkspaceSync({uid,storage,data,setData,blocked,logStorage}){
 const [status,setStatus]=useState(uid?'连接中':'仅本地'),[error,setError]=useState(''),[conflict,setConflict]=useState(null),[lastSync,setLastSync]=useState(null);
 const [entries,setEntries]=useState(()=>uid&&logStorage?readSyncLog(logStorage):[]);
 const record=(kind,revision=null)=>{if(uid&&logStorage)setEntries(appendSyncLog(logStorage,kind,revision))};
 const clearLog=()=>{try{logStorage?.removeItem(SYNC_LOG_KEY)}catch{}setEntries([])};
 const latest=useRef({data,blocked});latest.current={data,blocked};
 const active=useRef(true),busy=useRef(false),conflictRef=useRef(null),pausedForUpdate=useRef(false);
 const writeMeta=(revision,hash,state)=>{saveBaseline(uid,storage,revision,hash,state);storage.setItem(META_KEY,JSON.stringify({revision,hash}))};
 const sync=useCallback(async (resolution=null)=>{
  if(!uid||busy.current||pausedForUpdate.current||!active.current||latest.current.blocked||(!resolution&&conflictRef.current)||mobileNative&&document.visibilityState==='hidden')return;
  if(!navigator.onLine){setStatus('离线，修改保存在本机');record('offline');return}
  busy.current=true;setStatus('同步中');setError('');
  try{
   const snapshot=latest.current.data;const current=()=>active.current&&!latest.current.blocked&&latest.current.data===snapshot;
   if(!await prepareSyncSnapshot(storage,snapshot,current)){if(active.current)setStatus('等待本地保存');return}
   const meta=readMeta(storage);const base=await loadBaseline(uid,storage,meta);
   const [hash,emptyHash,remote]=await Promise.all([digest(snapshot),digest(initialState()),getRow(uid,meta,base)]);
   if(!active.current)return;
   const remoteHash=remote?await digest(remote.state):null;
   if(!active.current)return;
   if(!current()){setStatus('等待本地保存');return}
   let decision=decideSync({localHash:hash,remoteHash,remoteRevision:remote?.revision??null,meta,emptyHash});
   const unsafePull=!resolution&&decision==='pull'&&remote&&(unsafeSeriesPull(base||snapshot,remote.state)||unsafeHistoryPull(base||snapshot,remote.state)||((base||snapshot).preferenceProfile!==undefined&&remote.state.preferenceProfile===undefined));if(unsafePull)decision='conflict';
   if(resolution){
    // Recheck the exact cloud revision presented to the user.
    if((remote?.revision??null)!==conflictRef.current?.revision){decision='conflict'}
    else if(resolution?.kind==='fields'&&remote){
     if(hash!==conflictRef.current?.localHash){decision='conflict'}else{
      const merged=resolveTaskFields(base,snapshot,remote.state,resolution.choices);
      if(!merged){decision='conflict'}else{
       storage.setItem('todo-field-merge-backup',JSON.stringify({local:snapshot,remote:remote.state,revision:remote.revision}));
       saveState(storage,merged);writeMeta(remote.revision,remoteHash,remote.state);latest.current={...latest.current,data:merged};setData(merged);await requireCommittedStorage(storage);if(!active.current)return;conflictRef.current=null;setConflict(null);setStatus('已安全合并，等待上传');record('merge',remote.revision);return;
      }
     }
    }
    else if(resolution==='cloud'&&remote){preserveConflict(storage,snapshot);decision='pull'}
    else if(resolution==='local'){if(remote)preserveConflict(storage,remote.state);decision=remote?'push':'insert'}
   }
   if(decision==='conflict'&&!resolution&&!unsafePull&&remote){
    if(!active.current||latest.current.data!==snapshot){setStatus('等待本地保存');return}
    const merged=base?mergeTasks(base,snapshot,remote.state):null;
    if(merged){
     // Keep the new cloud revision as the merge base; persist merged local state
     // before the next CAS write. A newer local edit or cloud revision is never overwritten.
     saveState(storage,merged);writeMeta(remote.revision,remoteHash,remote.state);
     latest.current={...latest.current,data:merged};setData(merged);await requireCommittedStorage(storage);if(!active.current)return;setStatus('已安全合并，等待上传');record('merge',remote.revision);return;
    }
   }
   if(decision==='conflict'){const c={revision:remote?.revision??null,remote:remote?.state??null,base,localHash:hash};conflictRef.current=c;setConflict(c);setStatus('存在同步冲突');record('conflict',remote?.revision);return}
   if(decision==='pull'){
    // Save the downloaded snapshot before replacing the UI; never discard a local edit made during the request.
    if(latest.current.data!==snapshot)return;
    saveState(storage,remote.state);writeMeta(remote.revision,remoteHash,remote.state);
    latest.current={...latest.current,data:remote.state};setData(remote.state);await requireCommittedStorage(storage);if(!active.current)return;record(remote.mode==='delta'?'delta-pull':'pull',remote.revision)
   }else if(decision==='push'||decision==='insert'){
    if(!await prepareSyncSnapshot(storage,snapshot,current)){if(active.current)setStatus('等待本地保存');return}
    const row=await writeRow(uid,snapshot,decision==='insert'?null:remote.revision,remote?.state);
    if(!active.current)return;
    if(!row){record('retry',remote?.revision);if(resolution){const fresh=await getRow(uid,null,null);if(!active.current)return;const current=latest.current.data;const c={revision:fresh?.revision??null,remote:fresh?.state??null,base:null,localHash:await digest(current)};if(!active.current)return;conflictRef.current=c;setConflict(c);setStatus('云端版本已变化，请重新确认');record('conflict',c.revision)}else setStatus('检测到并发更新，等待重试');return}
    writeMeta(row.revision,hash,snapshot);await requireCommittedStorage(storage);if(!active.current)return;record(row.mode==='delta'?'delta':decision,row.revision)
   }else if(decision==='ack'){writeMeta(remote.revision,remoteHash,remote.state);await requireCommittedStorage(storage);if(!active.current)return}
   conflictRef.current=null;setConflict(null);setLastSync(new Date().toISOString());
   setStatus(decision==='empty'?'云端工作空间为空':latest.current.data!==(decision==='pull'?remote.state:snapshot)?'等待同步':'已同步');
  }catch(e){if(active.current){setError(e.message||'同步失败');setStatus('同步失败，保留本地数据');record('error')}}
  finally{busy.current=false}
 },[uid,storage,setData,logStorage]);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 useEffect(()=>{if(!uid||blocked)return;const t=setTimeout(()=>sync(),800);return()=>clearTimeout(t)},[data,uid,blocked,sync]);
 useEffect(()=>{if(!uid)return;return subscribeSyncWake(()=>sync(),{foregroundOnly:mobileNative})},[uid,sync]);
 const [realtime,setRealtime]=useState('connecting');
 useEffect(()=>{if(!uid)return;let alive=true;setRealtime('connecting');const channel=cloud.channel('todo-revision:'+uid);const wake=()=>sync();
 for(const event of ['INSERT','UPDATE'])channel.on('postgres_changes',{event,schema:'public',table:TABLE,filter:'user_id=eq.'+uid},wake);
 channel.subscribe(status=>{if(!alive)return;setRealtime(status==='SUBSCRIBED'?'connected':status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'?'fallback':'connecting');if(status==='SUBSCRIBED')wake()});return()=>{alive=false;cloud.removeChannel(channel).catch(()=>{})}
 },[uid,sync]);
 const pauseForUpdate=async()=>{
  if(pausedForUpdate.current)throw Error('正在处理软件更新');
  pausedForUpdate.current=true;
  const resume=()=>{pausedForUpdate.current=false};
  try{
   const end=Date.now()+30000;
   while(busy.current&&Date.now()<end)await new Promise(r=>setTimeout(r,100));
   if(busy.current||conflictRef.current||latest.current.blocked)throw Error('同步仍在进行或存在冲突，请处理后重试');
   return resume;
  }catch(e){resume();throw e}
 };
 return {status,error,conflict,lastSync,sync,entries,clearLog,realtime,pauseForUpdate}
}
