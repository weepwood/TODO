import {blockMinutes} from '../core/plan-block.js';
import {canonical,digest} from './cloud-core.js';
import {mergeActivity} from '../core/task-activity.js';
import {migrateState} from '../core/domain.js';
const eq=(a,b)=>canonical(a)===canonical(b);
const simple=t=>!t||t.repeat==='none'&&!t.seriesId&&!t.previousId&&!t.seriesHold&&!t.parentId&&!(t.dependsOn||[]).length&&!t.deletedAt;
const SAFE_FIELDS=new Set(['title','notes','priority','points']);
const changed=(a,b)=>[...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].filter(k=>!eq(a?.[k],b?.[k]));
// Only task-only, nonstructural concurrent edits are eligible. No guessing on deletion,
// order, generated instances, timer state, or cross-entity dependencies.
function mergeBusinessTasks(base,local,remote,resolveField){
 const other=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k!=='tasks'));
 if(!eq(other(base),other(local))||!eq(other(base),other(remote)))return null;
 const maps=[base,local,remote].map(s=>new Map(s.tasks.map(t=>[t.id,t])));
 const [b,l,r]=maps;
 if(maps.some((m,i)=>m.size!==[base,local,remote][i].tasks.length))return null;
 // No removals or concurrent reorders; preserve the common ordering and append new tasks.
 const order=base.tasks.map(t=>t.id);
 if(!eq(local.tasks.filter(t=>b.has(t.id)).map(t=>t.id),order)||!eq(remote.tasks.filter(t=>b.has(t.id)).map(t=>t.id),order))return null;
 const referenced=new Set();for(const s of [base,local,remote])for(const t of s.tasks){if(t.parentId)referenced.add(t.parentId);for(const dep of t.dependsOn||[])referenced.add(dep)}
 for(const id of new Set([...l.keys(),...r.keys()])){
  const before=b.get(id),a=l.get(id),c=r.get(id);
  if(eq(before,a)&&eq(before,c))continue;
  if(!simple(before)||!simple(a)||!simple(c))return null;
  // A task that is referenced by another task is not independent.
  if(referenced.has(id))return null;
  for(const side of [a,c])if(before&&side&&!eq(before,side)&&changed(before,side).some(k=>!SAFE_FIELDS.has(k)))return null;
 }
 const ids=[...order,...local.tasks.filter(t=>!b.has(t.id)).map(t=>t.id),...remote.tasks.filter(t=>!l.has(t.id)).map(t=>t.id)];
 const result=[];
 for(const id of ids){
  const before=b.get(id),a=l.get(id),c=r.get(id);
  if(eq(a,c)){result.push(a);continue}
  if(eq(a,before)){result.push(c);continue}
  if(eq(c,before)){result.push(a);continue}
  if(!before||!a||!c)return null;
  const aKeys=changed(before,a),cKeys=changed(before,c);
  const clash=aKeys.filter(k=>cKeys.includes(k)&&!eq(a[k],c[k]));
  if(clash.length&&!resolveField)return null;
  const task={...before,...Object.fromEntries(aKeys.map(k=>[k,a[k]])),...Object.fromEntries(cKeys.map(k=>[k,c[k]]))};
  for(const k of clash){const side=resolveField({key:JSON.stringify([id,k]),id,title:before.title,field:k,local:a[k],remote:c[k]});if(!['local','remote'].includes(side))return null;task[k]=side==='local'?a[k]:c[k]}
  result.push(task);
 }
 const merged={...base,tasks:result};
 try{const valid=migrateState(merged);return eq(valid,merged)?valid:null}catch{return null}
}
// Append-only records are mergeable; edits/removals/reorders or ambiguous
// legacy identifiers require explicit resolution rather than guessing.
export function mergeFocusSessions(base,local,remote){
 if(new Set(base.map(s=>s.id)).size!==base.length)return null;
 const sides=[local,remote];
 for(const side of sides){
  if(new Set(side.map(s=>s.id)).size!==side.length||side.length<base.length||base.some((s,i)=>!eq(s,side[i])))return null;
 }
 const added=new Map(),identities=new Map();
 const identity=s=>JSON.stringify([s.startedAt,s.mode,s.taskId??null]);
 for(const side of sides)for(const s of side.slice(base.length)){
  const prior=added.get(s.id);
  if(prior&&!eq(prior,s))return null;
  const key=identity(s),other=identities.get(key);
  // Two different IDs describing one timer are ambiguous (older clients).
  if(other&&other!==s.id)return null;
  identities.set(key,s.id);added.set(s.id,s);
 }
 const baselineIdentities=new Set(base.map(identity));
 if([...added.values()].some(s=>baselineIdentities.has(identity(s))))return null;
 return [...base,...[...added.values()].sort((a,b)=>String(a.startedAt).localeCompare(String(b.startedAt))||a.id.localeCompare(b.id))];
}
export function mergeTasks(base,local,remote,resolveField){
 const sessions=mergeFocusSessions(base.sessions,local.sessions,remote.sessions);
 if(!sessions)return null;
 // Timer and notification state are never guessed. Identical completion
 // of a shared timer can be merged, but divergent pause/resume/end cannot.
 const sameCompletion=!!base.timer&&eq(local.timer,remote.timer)&&eq(local.notifications,remote.notifications)&&eq(local.sessions,remote.sessions)&&!eq(base.timer,local.timer);
 const strip=s=>({...s,sessions:base.sessions,...(sameCompletion?{timer:base.timer,notifications:base.notifications}:{}),tasks:s.tasks.map(({activity,...t})=>t)});
 const merged=mergeBusinessTasks(strip(base),strip(local),strip(remote),resolveField);if(!merged)return null;
 const maps=[base,local,remote].map(s=>new Map(s.tasks.map(t=>[t.id,t.activity])));
 const result={...merged,sessions,...(sameCompletion?{timer:local.timer,notifications:local.notifications}:{}),tasks:merged.tasks.map(t=>{const activity=mergeActivity(...maps.map(m=>m.get(t.id))).filter(e=>e.taskId===undefined||e.taskId===t.id);return activity.length?{...t,activity}:t})};
 try{const valid=migrateState(result);return eq(valid,result)?valid:null}catch{return null}
}
// Reject a pull which would silently erase still-retained activity or focus
// records, while allowing normal capacity eviction and explicit task deletion.
const focusTimerIdentity=t=>JSON.stringify([t.phaseAt??t.createdAt,t.mode,t.taskId??null]);
export function unsafeHistoryPull(base,remote){
 const remoteTasks=new Map(remote.tasks.map(t=>[t.id,t]));
 if(base.importRuns?.length&&remote.importRuns===undefined)return true;
 if(base.queueHistory?.length){const rows=remote.queueHistory||[],map=new Map(rows.map(r=>[r.id,r]));if(base.queueHistory.some(r=>map.has(r.id)?!eq(r,map.get(r.id)):rows.length<100||r.endedAt>=rows.at(-1)?.endedAt))return true;}
 if(base.timer?.queueRun){
  const run=base.timer.queueRun;
  if(remote.timer&&focusTimerIdentity(base.timer)===focusTimerIdentity(remote.timer)&&!remote.timer.queueRun)return true;
  // Legacy active queues have no trustworthy start timestamp. New queues must
  // either continue with the same identity or carry a terminal receipt.
  if(run.startedAt&&remote.timer?.queueRun?.id!==run.id&&!remote.queueHistory?.some(r=>r.id===run.id))return true;
 }
 const habits=new Map(remote.habits.map(h=>[h.id,h]));if(base.habits.some(h=>habits.has(h.id)&&(h.planWeekdays&&habits.get(h.id).planWeekdays===undefined||h.planVersions?.length&&habits.get(h.id).planVersions===undefined)))return true;
 for(const t of base.tasks){
  const candidate=remoteTasks.get(t.id);if(candidate&&t.deadline&&candidate.deadline===undefined)return true;
  if(candidate&&t.planSegments?.length&&candidate.planSegments===undefined)return true;
  if(candidate&&t.planLocked===true&&candidate.planLocked===true&&t.status==='pending'&&candidate.status==='pending'&&!t.deletedAt&&!candidate.deletedAt&&(!eq(t.date,candidate.date)||!eq(t.time,candidate.time)||!eq(t.anchor,candidate.anchor)||blockMinutes(t)!==blockMinutes(candidate)||!eq(t.planSegments||[],candidate.planSegments||[])))return true;
  if(candidate&&(t.planMinutes!=null&&candidate.planMinutes===undefined||t.planLocked===true&&candidate.planLocked===undefined))return true;
  if(!t.activity?.length)continue;
  const next=remoteTasks.get(t.id);if(!next||eq(t.activity,next.activity))continue;
  if(!eq(mergeActivity(t.activity,next.activity),mergeActivity(next.activity)))return true;
 }
 const records=new Map(remote.sessions.map(s=>[s.id,s]));
 if(base.sessions.some(s=>!eq(s,records.get(s.id))))return true;
 const baseIds=new Set(base.sessions.map(s=>s.id)),known=new Map();
 const key=s=>JSON.stringify([s.startedAt,s.mode,s.taskId??null]);
 for(const s of base.sessions)known.set(key(s),s.id);
 for(const s of remote.sessions)if(!baseIds.has(s.id)){
  const prior=known.get(key(s));
  if(prior&&prior!==s.id&&(s.id.startsWith('timer:')||prior.startsWith('timer:')))return true;
  known.set(key(s),s.id);
 }
 return false;
}
export function manualMergePlan(base,local,remote){
 if(!base||!local||!remote)return null;const conflicts=[];
 const preview=mergeTasks(base,local,remote,item=>{conflicts.push(item);return 'local'});
 return preview&&conflicts.length?conflicts:null;
}
export function resolveTaskFields(base,local,remote,choices){
 const plan=manualMergePlan(base,local,remote);
 if(!plan||!choices||plan.some(c=>!['local','remote'].includes(choices[c.key])))return null;
 return mergeTasks(base,local,remote,c=>choices[c.key]);
}
const BASE_KEY='todo-cloud-base';
function openDb(){return new Promise((resolve,reject)=>{const q=indexedDB.open('todo-sync-baseline-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('baselines');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('baseline store blocked'))})}
async function idb(uid,value){const db=await openDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('baselines',value?'readwrite':'readonly'),store=tx.objectStore('baselines'),q=value?store.put(value,uid):store.get(uid);tx.oncomplete=()=>resolve(q.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('baseline transaction aborted'))})}finally{db.close()}}
export function saveBaseline(uid,storage,revision,hash,state){
 const value={revision,hash,state};
 if(storage.flush){storage.setItem(BASE_KEY,JSON.stringify(value));return}
 // The baseline is optional. If storage is unavailable, fall back to manual conflict protection.
 if(typeof indexedDB!=='undefined')idb(uid,value).catch(()=>{});
}
export async function loadBaseline(uid,storage,meta){
 if(!meta)return null;
 try{
  const raw=storage.flush?storage.getItem(BASE_KEY):null;
  const base=storage.flush?(raw?JSON.parse(raw):null):await idb(uid);
  if(!base||base.revision!==meta.revision||base.hash!==meta.hash)return null;
  const state=migrateState(base.state);return await digest(state)===meta.hash?state:null;
 }catch{return null}
}
