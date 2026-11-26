import {STORAGE_KEY,BACKUP_KEY,migrateState} from '../core/domain.js';
import {canonical} from './cloud-core.js';
export const STORE_KEYS=[STORAGE_KEY,BACKUP_KEY,BACKUP_KEY+'-at',BACKUP_KEY+'-corrupt','todo-cloud-meta','todo-cloud-base','todo-conflict-backup','todo-field-merge-backup','todo-native-migration-backup'];
export function migrationStore(saved,mirror,legacy){
 if(saved){if(!saved[STORAGE_KEY])throw Error('SQLite 主存储缺少工作空间');migrateState(JSON.parse(saved[STORAGE_KEY]));return saved}
 const output={...legacy};
 if(mirror){
  const db=migrateState(JSON.parse(mirror));
  if(legacy[STORAGE_KEY]){
   const local=migrateState(JSON.parse(legacy[STORAGE_KEY]));
   if(canonical(db)!==canonical(local)){
    // Old versions saved WebView first, then mirrored SQLite asynchronously.
    // Keep the browser version and retain the complete independent SQLite copy.
    output['todo-native-migration-backup']=mirror;
   }
  }else{output[STORAGE_KEY]=mirror;delete output['todo-cloud-meta']}
 }
 return output
}
export function createNativeStore(initial,write,onStatus=()=>{}){
 let values={...initial},committed={...initial},running=false,error='',scheduled=false;let waiters=[];
 const same=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
 const status=()=>onStatus({pending:running||scheduled||!same(values,committed),error});
 async function drain(){
  if(running)return;scheduled=false;running=true;error='';status();
  try{while(!same(values,committed)){const snapshot={...values};await write(snapshot);committed=snapshot}}
  catch(e){error=String(e)}
  finally{running=false;const done=!error&&same(values,committed);for(const resolve of waiters.splice(0))resolve(done);status()}
 }
 function schedule(){if(running||scheduled)return;scheduled=true;status();queueMicrotask(drain)}
 return {getItem:key=>values[key]??null,setItem(key,value){if(!STORE_KEYS.includes(key))throw Error('unsupported workspace storage key');const v=String(value);if(values[key]===v)return;values[key]=v;schedule()},removeItem(key){if(Object.hasOwn(values,key)){delete values[key];schedule()}},flush(){if(!running&&!scheduled&&same(values,committed))return Promise.resolve(true);return new Promise(resolve=>{waiters.push(resolve);schedule()})},retry:schedule,getStatus:()=>({pending:running||scheduled||!same(values,committed),error})}
}

// Native background events are best-effort flushes, not a guarantee of OS shutdown time.
export function attachNativeLifecycle(storage,doc,win){
 if(!storage?.flush)return ()=>{};
 let active=true,inFlight=false;
 const flush=()=>{const status=storage.getStatus?.();if(!active||inFlight||!status?.pending||status.error)return;
  inFlight=true;Promise.resolve().then(()=>storage.flush()).catch(()=>{}).finally(()=>{inFlight=false})};
 const visibility=()=>{if(doc.visibilityState==='hidden')flush()};
 doc.addEventListener('visibilitychange',visibility);win.addEventListener('pagehide',flush);win.addEventListener("blur",flush);win.addEventListener("todo-native-pause",flush);
 return ()=>{active=false;doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('pagehide',flush);win.removeEventListener("blur",flush);win.removeEventListener("todo-native-pause",flush)};
}
