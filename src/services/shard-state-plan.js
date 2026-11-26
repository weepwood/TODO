import {STORAGE_KEY,BACKUP_KEY,migrateState} from '../core/domain.js';
import {STORE_KEYS} from './native-store.js';

// Enforce the reference-reuse contract at the staging boundary. Frozen
// objects are memoized weakly; shallow-frozen input is still traversed.
// Only plain JSON graphs are eligible; reject mutable exotic objects/getters.
const sealed=new WeakSet();
export function sealWorkspace(value,visiting=new WeakSet()){
 if(value===null||typeof value!=='object'){
  if(typeof value==='function'||typeof value==='symbol'||typeof value==='bigint')throw Error('工作空间包含非JSON值');
  return value;
 }
 if(sealed.has(value))return value;
 if(visiting.has(value))throw Error('工作空间包含循环引用');
 const proto=Object.getPrototypeOf(value);
 if(Array.isArray(value)?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)throw Error('工作空间包含非普通对象');
 visiting.add(value);
 for(const key of Reflect.ownKeys(value)){
  const desc=Object.getOwnPropertyDescriptor(value,key);
  if(!desc||!('value' in desc))throw Error('工作空间包含动态属性');
  sealWorkspace(desc.value,visiting);
 }
 Object.freeze(value);visiting.delete(value);sealed.add(value);return value;
}

// The app's reducers replace changed task objects. Reference reuse is limited
// to a single plan chain, never shared across workspaces or external imports.
export function planStateParts(state,keys,bucket,previous=null){
 sealWorkspace(state);
 migrateState(state); // retain full domain validation (including relationships)
 const groups=new Map(),ids=[],seen=new Set(),parts=new Map(),{tasks,...meta}=state;
 for(const task of tasks){
  if(seen.has(task.id))throw Error('重复任务标识');
  seen.add(task.id);ids.push(task.id);
  const key='task:'+bucket(task.id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(task);
 }
 let reused=0,serialized=0;
 for(const [key,rows] of groups){
  rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const old=previous?.groups.get(key);
  if(old&&old.length===rows.length&&rows.every((task,i)=>task===old[i])){parts.set(key,previous.parts.get(key));reused++}
  else{parts.set(key,JSON.stringify(rows));serialized++}
 }
 const oldIds=previous?.ids;
 parts.set('order',oldIds&&oldIds.length===ids.length&&ids.every((id,i)=>id===oldIds[i])?previous.parts.get('order'):JSON.stringify(ids));
 parts.set('meta',JSON.stringify(meta));
 for(const key of STORE_KEYS)if(key!==STORAGE_KEY&&Object.hasOwn(keys,key))parts.set('kv:'+key,keys[key]);
 return {parts,groups,ids,reused,serialized};
}
export function createStateQueue(initial,write,onStatus=()=>{},now=Date.now){
 let state=sealWorkspace(JSON.parse(initial[STORAGE_KEY])),keys={...initial},raw=initial[STORAGE_KEY],committedState=state,committedKeys;
 delete keys[STORAGE_KEY];committedKeys=keys;
 let scheduled=false,running=false,error='',waiters=[],fullSerializations=0;
 const pending=()=>running||scheduled||state!==committedState||keys!==committedKeys;
 const getStatus=()=>({pending:pending(),error});
 const notify=()=>onStatus(getStatus());
 const stringify=()=>{if(raw===null){raw=JSON.stringify(state);fullSerializations++}return raw};
 async function drain(){
  if(running)return;scheduled=false;running=true;error='';notify();
  try{while(state!==committedState||keys!==committedKeys){
   const snapshot=state,metadata=keys;
   await write(snapshot,metadata);committedState=snapshot;committedKeys=metadata;
  }}catch(e){error=String(e)}
  finally{running=false;const done=!error&&!pending();for(const resolve of waiters.splice(0))resolve(done);notify()}
 }
 function schedule(){if(running||scheduled)return;scheduled=true;notify();queueMicrotask(drain)}
 function stageWorkspace(next){
  sealWorkspace(next);
  if(next===state)return;
  // Preserve existing hourly backup semantics. Serialize only when actually
  // taking a complete backup, exporting, or reading the compatibility API.
  let nextRaw=null;
  if(!keys[BACKUP_KEY]||now()-Number(keys[BACKUP_KEY+'-at']||0)>=3600000){
   const old=stringify();nextRaw=JSON.stringify(next);fullSerializations++;
   if(old===nextRaw)return
   keys={...keys,[BACKUP_KEY]:old,[BACKUP_KEY+'-at']:String(now())};
  }
  state=next;raw=nextRaw;schedule();
 }
 return {stageWorkspace,getItem:key=>key===STORAGE_KEY?stringify():keys[key]??null,
  setItem(key,value){if(!STORE_KEYS.includes(key))throw Error('unsupported workspace storage key');const v=String(value);
   if(key===STORAGE_KEY){if(raw===v)return;const next=JSON.parse(v);migrateState(next);state=sealWorkspace(next);raw=v;schedule();return}
   if(keys[key]!==v){keys={...keys,[key]:v};schedule()}
  },
  removeItem(key){if(key===STORAGE_KEY)throw Error('不能移除主工作空间');if(Object.hasOwn(keys,key)){const next={...keys};delete next[key];keys=next;schedule()}},
  flush(){if(!pending())return Promise.resolve(true);return new Promise(resolve=>{waiters.push(resolve);schedule()})},
  retry:schedule,getStatus,diagnostics:()=>({fullSerializations})};
}
