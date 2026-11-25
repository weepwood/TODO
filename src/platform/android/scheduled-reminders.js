import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {planAlarms,reminderKey,MAX_ALARMS,alarmNotification} from './reminder-plan.js';
import {requireMobileNotificationPermission} from './notifications.js';
const KEY='todo-android-alarm-registry-v1',ENABLED='todo-android-alarms-enabled';
const MIN=1000000000,MAX=1999999999;
let chain=Promise.resolve(),pausedScope=null;
const serialize=fn=>{const result=chain.then(fn,fn);chain=result.catch(()=>{});return result};
const fresh=()=>({next:MIN,rows:[]});
function read(){
 const raw=localStorage.getItem(KEY);if(!raw)return fresh();
 const v=JSON.parse(raw);if(!Number.isInteger(v.next)||v.next<MIN||v.next>MAX||!Array.isArray(v.rows)||v.rows.length>MAX_ALARMS||v.rows.some(r=>!Number.isInteger(r.id)||r.id<MIN||r.id>=v.next||typeof r.key!=='string'||typeof r.scope!=='string'||!Number.isFinite(r.epoch)||typeof r.accepted!=='boolean')||new Set(v.rows.map(r=>r.id)).size!==v.rows.length||new Set(v.rows.map(r=>r.key)).size!==v.rows.length)throw Error('定时提醒记录异常，请重置系统提醒。');
 return v;
}
const write=v=>localStorage.setItem(KEY,JSON.stringify(v));
const cancel=ids=>ids.length?invoke('plugin:notification|cancel',{notifications:ids}):Promise.resolve();
const reserved=id=>Number.isInteger(id)&&id>=MIN&&id<MAX;
async function pendingIds(){
 const pending=await invoke('plugin:notification|get_pending');
 if(!Array.isArray(pending))throw Error('系统提醒列表响应无效');
 return new Set(pending.map(r=>r.id).filter(reserved));
}
async function loadRegistry(){
 try{return read()}catch{
  // Registry corruption: cancel only our reserved notification IDs.
  await cancel([...await pendingIds()]);const v=fresh();write(v);return v;
 }
}
export function alarmsEnabled(){return localStorage.getItem(ENABLED)==='1'}
export function clearMobileAlarms(scope){pausedScope=scope;return serialize(async()=>{const v=await loadRegistry();const ids=new Set([...v.rows.map(r=>r.id),...await pendingIds()]);await cancel([...ids]);write({...v,rows:[]})})}
export function setAlarmsEnabled(enabled){return serialize(async()=>{
 if(enabled){await requireMobileNotificationPermission(invoke,{request:true});pausedScope=null;localStorage.setItem(ENABLED,'1')}
 else{localStorage.removeItem(ENABLED);const v=await loadRegistry();await cancel([...new Set([...v.rows.map(r=>r.id),...await pendingIds()])]);write({...v,rows:[]})}
})}
export function hasScheduledReminder(scope,taskId,at){
 try{return alarmsEnabled()&&read().rows.some(r=>r.key===reminderKey(scope,taskId,at)&&r.accepted)}catch{return false}
}
export function reconcileMobileAlarms(scope,tasks,{now=Date.now,alive=()=>true}={}){
 return serialize(async()=>{
  if(!alive()||pausedScope===scope)return 0;
  const v=await loadRegistry(),time=now();
  const desired=alarmsEnabled()?planAlarms(tasks,scope,time,v.rows.filter(r=>r.scope===scope)):[];
  const old=new Map(v.rows.map(r=>[r.key,r])),keep=new Set(desired.map(r=>r.key));
  const obsolete=v.rows.filter(r=>!keep.has(r.key)||desired.some(d=>d.key===r.key&&d.epoch!==r.epoch));
  // Recover orphan requests after WebView data loss or a crash during a batch.
  const pending=await pendingIds(),known=new Set(v.rows.map(r=>r.id));
  await cancel([...new Set([...obsolete.map(r=>r.id),...[...pending].filter(id=>!known.has(id))])]);
  for(const r of obsolete){old.delete(r.key);pending.delete(r.id)}
  v.rows=desired.map(d=>{const existing=old.get(d.key);if(existing)return existing;if(v.next>=MAX)throw Error('提醒编号耗尽');return {...d,id:v.next++,accepted:false}});
  write(v);if(!v.rows.length||!alive()||pausedScope===scope)return 0;
  // Only schedule future alarms. Past accepted alarms may still be delayed by Doze.
  await requireMobileNotificationPermission(invoke);
  for(const r of v.rows)if(pending.has(r.id))r.accepted=true;
  write(v);
  const additions=v.rows.filter(r=>r.epoch>now()&&!pending.has(r.id));
  if(!additions.length||!alive()||pausedScope===scope)return v.rows.filter(r=>r.accepted).length;
  const ids=await invoke('plugin:notification|batch',{notifications:additions.map(r=>alarmNotification(r.id,r.epoch))});
  if(!Array.isArray(ids)||additions.some(r=>!ids.includes(r.id)))throw Error('系统未确认全部定时提醒');
  for(const r of additions)r.accepted=true;
  write(v);return v.rows.filter(r=>r.accepted).length;
 })
}
export function useMobileAlarms({enabled,scope,tasks,storage,blocked}){
 const [active,setActive]=useState(()=>enabled&&alarmsEnabled()),[status,setStatus]=useState('');
 const latest=useRef(null);latest.current={tasks,blocked};
 useEffect(()=>{if(enabled)pausedScope=null},[enabled,scope]);
 useEffect(()=>{if(!enabled)return;let disposed=false;
 const sync=async()=>{if(disposed||latest.current.blocked)return;try{
  if(storage?.flush&&!await storage.flush())throw Error('本机保存失败');
  if(disposed)return;
  const count=await reconcileMobileAlarms(scope,latest.current.tasks,{alive:()=>!disposed});
  if(!disposed)setStatus(active?'系统已接收 '+count+' 项定时提醒请求':'系统定时提醒未启用');
 }catch(e){if(!disposed)setStatus('定时提醒待恢复：'+String(e))}};
 const timer=setTimeout(sync,350),wake=()=>{if(document.visibilityState==='visible')sync()};
 window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
 return()=>{disposed=true;clearTimeout(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake)}
 },[enabled,scope,tasks,storage,blocked,active]);
 const toggle=async()=>{try{await setAlarmsEnabled(!active);setActive(!active)}catch(e){setActive(alarmsEnabled());setStatus(String(e))}};
 return {active,status,toggle};
}
