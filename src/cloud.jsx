import React,{useEffect,useRef,useState,useCallback} from 'react';
import {createClient} from '@supabase/supabase-js';
import {CLOUD_URL,CLOUD_KEY} from './cloud-config.js';
import {initialState,migrateState,readState,saveState,STORAGE_KEY} from './domain.js';
import {scopedStorage,canonical,digest,readMeta,META_KEY,decideSync,readRemote,preserveConflict} from './cloud-core.js';
export const cloud=createClient(CLOUD_URL,CLOUD_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
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
async function getRow(uid){const {data,error}=await cloud.from(TABLE).select('revision,state,updated_at').eq('user_id',uid).abortSignal(AbortSignal.timeout(12000)).maybeSingle();if(error)throw error;return readRemote(data)}
async function writeRow(uid,state,revision){
 const body=JSON.stringify(state);if(new TextEncoder().encode(body).length>3500000)throw Error('工作空间超过 3.5 MB，请导出备份并整理历史记录');
 const q=revision===null?cloud.from(TABLE).insert({user_id:uid,state,revision:1}):cloud.from(TABLE).update({state,revision:revision+1}).eq('user_id',uid).eq('revision',revision);
 const {data,error}=await q.select('revision,updated_at').abortSignal(AbortSignal.timeout(12000)).maybeSingle();
 if(error){if(error.code==='23505'||error.code==='40001')return null;throw error}return data
}
export function useWorkspaceSync({uid,storage,data,setData,blocked}){
 const [status,setStatus]=useState(uid?'连接中':'仅本地'),[error,setError]=useState(''),[conflict,setConflict]=useState(null),[lastSync,setLastSync]=useState(null);
 const latest=useRef({data,blocked});latest.current={data,blocked};
 const active=useRef(true),busy=useRef(false),conflictRef=useRef(null);
 const writeMeta=(revision,hash)=>storage.setItem(META_KEY,JSON.stringify({revision,hash}));
 const sync=useCallback(async (resolution=null)=>{
  if(!uid||busy.current||!active.current||latest.current.blocked||(!resolution&&conflictRef.current))return;
  if(!navigator.onLine){setStatus('离线，修改保存在本机');return}
  busy.current=true;setStatus('同步中');setError('');
  try{
   const snapshot=latest.current.data;const [hash,emptyHash,remote]=await Promise.all([digest(snapshot),digest(initialState()),getRow(uid)]);
   if(!active.current)return;
   const meta=readMeta(storage),remoteHash=remote?await digest(remote.state):null;
   if(!active.current)return;
   if(latest.current.data!==snapshot){setStatus('等待本地保存');return}
   let decision=decideSync({localHash:hash,remoteHash,remoteRevision:remote?.revision??null,meta,emptyHash});
   if(resolution){
    // Recheck the exact cloud revision presented to the user.
    if((remote?.revision??null)!==conflictRef.current?.revision){decision='conflict'}
    else if(resolution==='cloud'&&remote){preserveConflict(storage,snapshot);decision='pull'}
    else if(resolution==='local'){if(remote)preserveConflict(storage,remote.state);decision=remote?'push':'insert'}
   }
   if(decision==='conflict'){const c={revision:remote?.revision??null,remote:remote?.state??null};conflictRef.current=c;setConflict(c);setStatus('存在同步冲突');return}
   if(decision==='pull'){
    // Save the downloaded snapshot before replacing the UI; never discard a local edit made during the request.
    if(latest.current.data!==snapshot)return;
    saveState(storage,remote.state);writeMeta(remote.revision,remoteHash);
    latest.current={...latest.current,data:remote.state};setData(remote.state)
   }else if(decision==='push'||decision==='insert'){
    const row=await writeRow(uid,snapshot,decision==='insert'?null:remote.revision);
    if(!active.current)return;
    if(!row){setStatus('检测到并发更新，等待重试');return}
    writeMeta(row.revision,hash)
   }else if(decision==='ack'){writeMeta(remote.revision,remoteHash)}
   conflictRef.current=null;setConflict(null);setLastSync(new Date().toISOString());
   setStatus(decision==='empty'?'云端工作空间为空':latest.current.data!==snapshot&&decision!=='pull'?'等待同步':'已同步');
  }catch(e){if(active.current){setError(e.message||'同步失败');setStatus('同步失败，保留本地数据')}}
  finally{busy.current=false}
 },[uid,storage,setData]);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 useEffect(()=>{if(!uid||blocked)return;const t=setTimeout(()=>sync(),800);return()=>clearTimeout(t)},[data,uid,blocked,sync]);
 useEffect(()=>{if(!uid)return;const run=()=>sync();const t=setInterval(run,15000);window.addEventListener('online',run);window.addEventListener('focus',run);return()=>{clearInterval(t);window.removeEventListener('online',run);window.removeEventListener('focus',run)}},[uid,sync]);
 return {status,error,conflict,lastSync,sync}
}
export function AccountPanel({session,sync,importGuest,exportConflict,storageError}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[register,setRegister]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function authenticate(e){e.preventDefault();setBusy(true);setMessage('');try{const result=register?await cloud.auth.signUp({email,password,options:{emailRedirectTo:window.location.protocol==='http:'||window.location.protocol==='https:'?window.location.origin+window.location.pathname:'https://weepwood.github.io/TODO/'}}):await cloud.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(register&&!result.data.session)setMessage('注册请求已提交，请检查确认邮件，然后返回登录。');setPassword('')}catch(err){setMessage(err.message||'认证失败')}finally{setBusy(false)}}
 async function signOut(){if(!confirm('退出后将返回本机访客空间，当前账号缓存保留在此浏览器。确认退出？'))return;setBusy(true);try{const {error}=await cloud.auth.signOut({scope:'local'});if(error)throw error}catch(e){setMessage(e.message)}finally{setBusy(false)}}
 return <section className="account-panel"><h3>账号与云同步</h3>{session?<><p className="account-email">{session.user.email||session.user.id}</p><p className="muted" role="status">{sync.status}{sync.lastSync?' · '+new Date(sync.lastSync).toLocaleString():''}</p>{sync.error&&<p className="sync-error">{sync.error}</p>}{storageError&&<p className="sync-error">本地存储异常，暂停同步。</p>}{sync.conflict&&<div className="sync-conflict"><strong>本地和云端均有不同修改</strong><p>同步已暂停。请选择保留哪一份；被替换的数据会尝试保存在本机冲突备份中。</p><div className="button-grid">{sync.conflict.remote&&<button className="secondary" onClick={()=>{if(confirm('使用云端版本？当前本地修改将保留为冲突备份。'))sync.sync('cloud')}}>使用云端版本</button>}<button className="secondary" onClick={()=>{if(confirm('以当前本地工作空间替换云端版本？云端原始数据将备份到本机。'))sync.sync('local')}}>保留本地并上传</button></div></div>}<div className="button-grid"><button className="secondary" onClick={()=>sync.sync()} disabled={!!sync.conflict}>立即同步</button><button className="secondary" onClick={importGuest}>导入访客数据</button><button className="secondary" onClick={exportConflict}>导出冲突备份</button><button className="secondary" onClick={signOut} disabled={busy}>退出登录</button></div></>:<><p className="muted">本地访客空间与每个账号独立。登录后可同步任务，也可以手动导入访客数据。</p><form className="auth-form" onSubmit={authenticate}><label>邮箱<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><label>密码<input type="password" autoComplete={register?'new-password':'current-password'} minLength={6} required value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="button-grid"><button className="primary" disabled={busy}>{busy?'处理中…':register?'注册账号':'登录'}</button><button className="secondary" type="button" onClick={()=>{setRegister(v=>!v);setMessage('')}}>{register?'返回登录':'注册新账号'}</button></div></form></>}{message&&<p className="sync-error" role="status">{message}</p>}</section>
}
