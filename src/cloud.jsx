import {subscribeSyncWake} from './platform/web/sync-wake.js';
import {mobileNative,androidNative} from './platform/runtime.js';
import {invoke} from '@tauri-apps/api/core';
import {ANDROID_SESSION_KEY,createAndroidSessionStorage} from './platform/android/session-storage.js';
import React,{useEffect,useRef,useState,useCallback} from 'react';
import {createClient} from '@supabase/supabase-js';
import {isTauri} from '@tauri-apps/api/core';
import {CLOUD_URL,CLOUD_KEY} from './cloud-config.js';
import {initialState,migrateState,readState,saveState,STORAGE_KEY} from './core/domain.js';
import {mergeTasks,resolveTaskFields,saveBaseline,loadBaseline} from './services/sync-merge.js';
import {buildTaskDelta,replayTaskDeltas} from './services/task-delta.js';
import {appendSyncLog,readSyncLog,SYNC_LOG_KEY} from './services/sync-diagnostics.js';
import {SyncDiagnostics,ConflictPreview,FieldMerge} from './sync-ui.jsx';
import {scopedStorage,canonical,digest,readMeta,META_KEY,decideSync,readRemote,preserveConflict,authErrorMessage} from './services/cloud-core.js';
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
 const body=JSON.stringify(state);if(new TextEncoder().encode(body).length>3500000)throw Error('工作空间超过 3.5 MB，请导出备份并整理历史记录');
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
   const snapshot=latest.current.data,meta=readMeta(storage);const base=await loadBaseline(uid,storage,meta);
   const [hash,emptyHash,remote]=await Promise.all([digest(snapshot),digest(initialState()),getRow(uid,meta,base)]);
   if(!active.current)return;
   const remoteHash=remote?await digest(remote.state):null;
   if(!active.current)return;
   if(latest.current.data!==snapshot){setStatus('等待本地保存');return}
   let decision=decideSync({localHash:hash,remoteHash,remoteRevision:remote?.revision??null,meta,emptyHash});
   if(resolution){
    // Recheck the exact cloud revision presented to the user.
    if((remote?.revision??null)!==conflictRef.current?.revision){decision='conflict'}
    else if(resolution?.kind==='fields'&&remote){
     if(hash!==conflictRef.current?.localHash){decision='conflict'}else{
      const merged=resolveTaskFields(base,snapshot,remote.state,resolution.choices);
      if(!merged){decision='conflict'}else{
       storage.setItem('todo-field-merge-backup',JSON.stringify({local:snapshot,remote:remote.state,revision:remote.revision}));
       saveState(storage,merged);writeMeta(remote.revision,remoteHash,remote.state);latest.current={...latest.current,data:merged};setData(merged);conflictRef.current=null;setConflict(null);setStatus('已安全合并，等待上传');record('merge',remote.revision);return;
      }
     }
    }
    else if(resolution==='cloud'&&remote){preserveConflict(storage,snapshot);decision='pull'}
    else if(resolution==='local'){if(remote)preserveConflict(storage,remote.state);decision=remote?'push':'insert'}
   }
   if(decision==='conflict'&&!resolution&&remote){
    if(!active.current||latest.current.data!==snapshot){setStatus('等待本地保存');return}
    const merged=base?mergeTasks(base,snapshot,remote.state):null;
    if(merged){
     // Keep the new cloud revision as the merge base; persist merged local state
     // before the next CAS write. A newer local edit or cloud revision is never overwritten.
     saveState(storage,merged);writeMeta(remote.revision,remoteHash,remote.state);
     latest.current={...latest.current,data:merged};setData(merged);setStatus('已安全合并，等待上传');record('merge',remote.revision);return;
    }
   }
   if(decision==='conflict'){const c={revision:remote?.revision??null,remote:remote?.state??null,base,localHash:hash};conflictRef.current=c;setConflict(c);setStatus('存在同步冲突');record('conflict',remote?.revision);return}
   if(decision==='pull'){
    // Save the downloaded snapshot before replacing the UI; never discard a local edit made during the request.
    if(latest.current.data!==snapshot)return;
    saveState(storage,remote.state);writeMeta(remote.revision,remoteHash,remote.state);
    latest.current={...latest.current,data:remote.state};setData(remote.state);record(remote.mode==='delta'?'delta-pull':'pull',remote.revision)
   }else if(decision==='push'||decision==='insert'){
    const row=await writeRow(uid,snapshot,decision==='insert'?null:remote.revision,remote?.state);
    if(!active.current)return;
    if(!row){record('retry',remote?.revision);if(resolution){const fresh=await getRow(uid,null,null);if(!active.current)return;const current=latest.current.data;const c={revision:fresh?.revision??null,remote:fresh?.state??null,base:null,localHash:await digest(current)};if(!active.current)return;conflictRef.current=c;setConflict(c);setStatus('云端版本已变化，请重新确认');record('conflict',c.revision)}else setStatus('检测到并发更新，等待重试');return}
    writeMeta(row.revision,hash,snapshot);record(row.mode==='delta'?'delta':decision,row.revision)
   }else if(decision==='ack'){writeMeta(remote.revision,remoteHash,remote.state)}
   conflictRef.current=null;setConflict(null);setLastSync(new Date().toISOString());
   setStatus(decision==='empty'?'云端工作空间为空':latest.current.data!==snapshot&&decision!=='pull'?'等待同步':'已同步');
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
export function AccountPanel({session,sync,importGuest,exportConflict,storageError,beforeSignOut,localData}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[register,setRegister]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function authenticate(e){e.preventDefault();setBusy(true);setMessage('');try{const result=register?await cloud.auth.signUp({email,password,options:{emailRedirectTo:!isTauri()&&['http:','https:'].includes(window.location.protocol)?window.location.origin+window.location.pathname:'https://weepwood.github.io/TODO/'}}):await cloud.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(register&&!result.data.session)setMessage('注册请求已提交，请检查确认邮件，然后返回登录。');setPassword('')}catch(err){setMessage(authErrorMessage(err))}finally{setBusy(false)}}
 async function signOut(){if(!confirm('退出后将返回本机访客空间，当前账号缓存保留在此浏览器。确认退出？'))return;setBusy(true);try{if(beforeSignOut&&!await beforeSignOut())throw Error('本地保存失败，已取消退出。请重试保存或导出数据。');const {error}=await cloud.auth.signOut({scope:'local'});if(error)throw error}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 return <section className="account-panel"><h3>账号与云同步</h3>{session?<><p className="account-email">{session.user.email||session.user.id}</p><p className="muted" role="status">{sync.status}{sync.lastSync?' · '+new Date(sync.lastSync).toLocaleString():''}</p><p className="muted small" data-testid="realtime-status">{sync.realtime==='connected'?'实时连接已建立':sync.realtime==='fallback'?'实时连接不可用，继续定期同步':'正在连接实时服务'}</p>{sync.error&&<p className="sync-error">{sync.error}</p>}{storageError&&<p className="sync-error">本地存储异常，暂停同步。</p>}{sync.conflict&&<div className="sync-conflict"><strong>本地和云端均有不同修改</strong><p>同步已暂停。请选择保留哪一份；被替换的数据会尝试保存在本机冲突备份中。</p><ConflictPreview local={localData} remote={sync.conflict.remote}/>{sync.conflict.remote&&<FieldMerge key={sync.conflict.revision+":"+sync.conflict.localHash} conflict={sync.conflict} local={localData} onApply={choices=>sync.sync({kind:"fields",choices})}/>}<div className="button-grid">{sync.conflict.remote&&<button className="secondary" onClick={()=>{if(confirm('使用云端版本？当前本地修改将保留为冲突备份。'))sync.sync('cloud')}}>使用云端版本</button>}<button className="secondary" onClick={()=>{if(confirm('以当前本地工作空间替换云端版本？云端原始数据将备份到本机。'))sync.sync('local')}}>保留本地并上传</button></div></div>}<div className="button-grid"><button className="secondary" onClick={()=>sync.sync()} disabled={!!sync.conflict}>立即同步</button><button className="secondary" onClick={importGuest}>导入访客数据</button><button className="secondary" onClick={exportConflict}>导出冲突备份</button><button className="secondary" onClick={signOut} disabled={busy}>退出登录</button></div><SyncDiagnostics entries={sync.entries} clear={sync.clearLog}/></>:<><p className="muted">本地访客空间与每个账号独立。登录后可同步任务，也可以手动导入访客数据。独立普通任务的无冲突修改会自动合并。</p><form className="auth-form" onSubmit={authenticate}><label>邮箱<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><label>密码<input type="password" autoComplete={register?'new-password':'current-password'} minLength={register?12:6} required value={password} onChange={e=>setPassword(e.target.value)}/></label>{register&&<p className="muted small">新账号密码至少 12 个字符，建议使用唯一的随机密码。注册后需确认邮件。</p>}<div className="button-grid"><button className="primary" disabled={busy}>{busy?'处理中…':register?'注册账号':'登录'}</button><button className="secondary" type="button" onClick={()=>{setRegister(v=>!v);setMessage('')}}>{register?'返回登录':'注册新账号'}</button></div></form></>}{message&&<p className="sync-error" role="status">{message}</p>}</section>
}
