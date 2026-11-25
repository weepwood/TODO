import {canonical,digest} from './cloud-core.js';
import {migrateState} from './domain.js';
const eq=(a,b)=>canonical(a)===canonical(b);
const simple=t=>!t||t.repeat==='none'&&!t.seriesId&&!t.parentId&&!(t.dependsOn||[]).length&&!t.deletedAt;
const SAFE_FIELDS=new Set(['title','notes','priority']);
const changed=(a,b)=>[...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].filter(k=>!eq(a?.[k],b?.[k]));
// Only task-only, nonstructural concurrent edits are eligible. No guessing on deletion,
// order, generated instances, timer state, or cross-entity dependencies.
export function mergeTasks(base,local,remote,resolveField){
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
