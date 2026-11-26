import {initialState,migrateState,STORAGE_KEY} from '../core/domain.js';
import {STORE_KEYS} from './native-store.js';
import {planStateParts,createStateQueue} from './shard-state-plan.js';
import {assertShardWriter} from './storage-switch-protocol.js';
import {digest} from './cloud-core.js';
import {legacySnapshot} from './web-workspace-store.js';

// Isolated v2 pilot. All records use a compound key [scope, kind, key].
// 128 stable ID buckets preserve order separately and avoid shifting all
// later records on insertion. Full backup strings retain existing semantics.
export const SHARD_DB='todo-web-workspace-pilot-v2',BUCKETS=128;
const utf8=new TextEncoder();
async function hashPart(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(value))),b=>b.toString(16).padStart(2,'0')).join('')}
async function manifestFor(parts){return Object.fromEntries(await Promise.all([...parts].map(async([k,v])=>[k,await hashPart(v)])))}
const TABLE='records',ARCHIVE='recovery',MAX_FILE=64*1024*1024;
export const MAX_ARCHIVES=5,MAX_ARCHIVE_BYTES=128*1024*1024;
const scopeRange=scope=>IDBKeyRange.bound([scope],[scope,[]],false,true);
const allowedScope=s=>s==='guest'||/^account:synthetic-[a-z0-9-]{1,64}$/.test(s);
const checkScope=s=>{if(!allowedScope(s))throw Error('仅允许隔离合成工作空间')};
const exact=(a,b)=>STORE_KEYS.every(k=>(a[k]??null)===(b[k]??null));
function validate(values){
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(k=>!STORE_KEYS.includes(k)||typeof values[k]!=='string')||!values[STORAGE_KEY])throw Error('工作空间快照无效');
 const state=JSON.parse(values[STORAGE_KEY]);migrateState(state);return state;
}
function sourceValid(source){if(!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).some(k=>!STORE_KEYS.includes(k)||typeof source[k]!=='string'))throw Error('原始数据记录无效')}
export const semanticDigest=async values=>digest({...values,[STORAGE_KEY]:validate(values)});
export const sourceDigest=source=>digest(source);
export function bucket(id){let h=2166136261;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);return (h>>>0)%BUCKETS}
export function splitSnapshot(values){
 const state=validate(values),{tasks,...meta}=state,parts=new Map(),groups=new Map();
 parts.set('meta',JSON.stringify(meta));parts.set('order',JSON.stringify(tasks.map(t=>t.id)));
 for(const task of tasks){const key='task:'+bucket(task.id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(task)}
 for(const [key,rows] of groups)parts.set(key,JSON.stringify(rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)));
 for(const key of STORE_KEYS)if(key!==STORAGE_KEY&&Object.hasOwn(values,key))parts.set('kv:'+key,values[key]);
 return parts;
}
export function joinSnapshot(parts){
 if(!parts.has('meta')||!parts.has('order'))throw Error('工作空间分片缺失');
 const meta=JSON.parse(parts.get('meta')),order=JSON.parse(parts.get('order')),tasks=new Map(),values={};
 if(!meta||typeof meta!=='object'||Array.isArray(meta)||Object.hasOwn(meta,'tasks')||!Array.isArray(order)||new Set(order).size!==order.length)throw Error('工作空间索引无效');
 for(const [key,raw] of parts){
  if(key==='meta'||key==='order')continue;
  if(key.startsWith('task:')){const rows=JSON.parse(raw);if(!Array.isArray(rows)||!rows.length)throw Error('任务分片无效');for(const task of rows){if(typeof task?.id!=='string'||tasks.has(task.id)||key!=='task:'+bucket(task.id))throw Error('任务分片索引冲突');tasks.set(task.id,task)}}
  else if(key.startsWith('kv:')&&STORE_KEYS.includes(key.slice(3))&&key.slice(3)!==STORAGE_KEY)values[key.slice(3)]=raw;
  else throw Error('未知工作空间分片');
 }
 if(order.length!==tasks.size||order.some(id=>!tasks.has(id)))throw Error('任务分片不完整');
 values[STORAGE_KEY]=JSON.stringify({...meta,tasks:order.map(id=>tasks.get(id))});validate(values);return values;
}
export function diffParts(before,after){return {put:[...after].filter(([key,value])=>before.get(key)!==value),remove:[...before.keys()].filter(key=>!after.has(key))}}
export async function makeRecovery(scope,values){checkScope(scope);values={...values};const state=validate(values),file={format:'todo-sharded-recovery-v1',scope,count:state.tasks.length,sha256:await semanticDigest(values),values:{...values}};if(utf8.encode(JSON.stringify(file)).length>MAX_FILE)throw Error('恢复文件超过64 MiB');return file}
export async function parseRecovery(raw,scope){
 checkScope(scope);if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_FILE)throw Error('恢复文件超过64 MiB');
 const file=JSON.parse(raw);if(file?.format!=='todo-sharded-recovery-v1'||file.scope!==scope)throw Error('恢复文件格式或作用域不匹配');
 const state=validate(file.values);if(file.count!==state.tasks.length||file.sha256!==await semanticDigest(file.values))throw Error('恢复文件摘要或任务数量不匹配');
 return file;
}
export function openShardDatabase(factory=globalThis.indexedDB){
 if(!factory)return Promise.reject(Error('浏览器不支持 IndexedDB'));
 return new Promise((resolve,reject)=>{let blocked=false;const q=factory.open(SHARD_DB,1);q.onupgradeneeded=()=>{q.result.createObjectStore(TABLE,{keyPath:['scope','kind','key']});q.result.createObjectStore(ARCHIVE,{keyPath:['scope','revision']})};q.onblocked=()=>{blocked=true;reject(Error('数据库升级被阻塞'))};q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result;if(blocked){db.close();return}db.onversionchange=()=>db.close();resolve(db)}});
}
function tx(db,mode,run,archive=false){
 return new Promise((resolve,reject)=>{let t,out,failure;const tables=archive?[TABLE,ARCHIVE]:TABLE;try{t=mode==='readwrite'?db.transaction(tables,mode,{durability:'strict'}):db.transaction(tables,mode)}catch(e){if(mode==='readwrite'&&e instanceof TypeError){try{t=db.transaction(tables,mode)}catch(f){reject(f);return}}else{reject(e);return}}
  t.oncomplete=()=>resolve(out);t.onabort=()=>reject(failure||t.error||Error('事务中止'));t.onerror=()=>{};
  const step=fn=>event=>{try{out=fn(event.target.result)}catch(e){failure=e;t.abort()}};
  try{run(t.objectStore(TABLE),step,archive?t.objectStore(ARCHIVE):null)}catch(e){failure=e;t.abort()}
 });
}
const record=(scope,kind,key,value)=>({scope,kind,key,value});
const headerKey=scope=>[scope,'header',''];
function headerValid(h){if(!h||!Number.isSafeInteger(h.revision)||h.revision<1||!['active','retired'].includes(h.mode)||!h.manifest||typeof h.manifest!=='object'||Array.isArray(h.manifest)||!/^([a-f0-9]{64})$/.test(h.sourceHash))throw Error('工作空间版本无效');return h}
function checkVersion(h,revision){headerValid(h);if(h.mode!=='active'||h.revision!==revision||revision===Number.MAX_SAFE_INTEGER)throw Error('工作空间版本冲突')}
export function readRawShardRecords(db,scope){checkScope(scope);return tx(db,'readonly',(store,step)=>{store.getAll(scopeRange(scope)).onsuccess=step(rows=>rows)})}
export async function readShardWorkspace(db,scope){
 checkScope(scope);const row=await tx(db,'readonly',(store,step)=>{store.getAll(scopeRange(scope)).onsuccess=step(rows=>{
  if(!rows.length)return null;
  const header=headerValid(rows.find(r=>r.kind==='header'&&r.key==='')?.value),source=rows.find(r=>r.kind==='source'&&r.key==='')?.value;sourceValid(source);
  const parts=new Map(rows.filter(r=>r.kind==='part').map(r=>[r.key,r.value]));
  if(rows.length!==parts.size+2)throw Error('工作空间记录结构无效');
  return {scope,...header,source,parts};
 })});
 if(!row)return null;
 const actual=await manifestFor(row.parts);if(Object.keys(actual).length!==Object.keys(row.manifest).length||Object.keys(actual).some(k=>actual[k]!==row.manifest[k])||await sourceDigest(row.source)!==row.sourceHash)throw Error('工作空间分片或原始数据摘要不匹配');
 return {...row,values:joinSnapshot(row.parts)};
}
// The explicit confirmation binds the exact legacy keys read before the UI
// review. A changed source or an existing database never gets overwritten.
export async function migrateShardWorkspace(db,scope,legacy,confirmedDigest){
 checkScope(scope);const source=legacySnapshot(legacy);sourceValid(source);
 if(!source[STORAGE_KEY]&&Object.keys(source).length)throw Error('原始主数据缺失，保留备份');
 if(await sourceDigest(source)!==confirmedDigest||!exact(legacySnapshot(legacy),source))throw Error('原始数据已变化，请重新确认');
 const values={...source,[STORAGE_KEY]:source[STORAGE_KEY]??JSON.stringify(initialState())},parts=splitSnapshot(values),manifest=await manifestFor(parts),sourceHash=await sourceDigest(source);
 await tx(db,'readwrite',(store,step)=>{store.get(headerKey(scope)).onsuccess=step(existing=>{
  if(existing||!exact(legacySnapshot(legacy),source))throw Error('已有工作空间或旧数据发生变化');
  store.add(record(scope,'header','',{revision:1,mode:'active',manifest,sourceHash}));store.add(record(scope,'source','',source));
  for(const [key,value] of parts)store.add(record(scope,'part',key,value));
 })});
 const saved=await readShardWorkspace(db,scope);
 if(await semanticDigest(saved.values)!==await semanticDigest(values)||!exact(saved.source,source))throw Error('迁移后摘要校验失败，保留原始数据');
 return saved;
}
async function commitParts(db,base,parts,legacy,{archive=false,guard=false,checkRuntime=()=>{}}={}){
 const {scope,revision}=base;checkScope(scope);checkRuntime();const delta=diffParts(base.parts,parts);
 if(!exact(legacySnapshot(legacy),base.source))throw Error('旧客户端数据已变化，请导出当前草稿');
 const changed=!!(delta.put.length||delta.remove.length),prior=archive&&changed?await makeRecovery(scope,base.values):null,manifest={...base.manifest,...await manifestFor(new Map(delta.put))};for(const key of delta.remove)delete manifest[key];
 await tx(db,'readwrite',(store,step,archives)=>{store.get(headerKey(scope)).onsuccess=step(row=>{
  checkVersion(row?.value,revision);checkRuntime();if(guard)assertShardWriter(legacy,base.sourceHash);if(!exact(legacySnapshot(legacy),base.source))throw Error('旧客户端数据已变化');
  if(!changed)return;
  const apply=()=>{
  checkRuntime();if(guard)assertShardWriter(legacy,base.sourceHash);if(!exact(legacySnapshot(legacy),base.source))throw Error('旧客户端数据已变化');
  if(prior)archives.add({scope,revision,file:prior});
  for(const [key,value] of delta.put)store.put(record(scope,'part',key,value));
  for(const key of delta.remove)store.delete([scope,'part',key]);
  store.put(record(scope,'header','',{revision:revision+1,mode:'active',manifest,sourceHash:base.sourceHash}));
  };
  if(prior)archives.getAll(scopeRange(scope)).onsuccess=step(rows=>{const bytes=rows.reduce((n,r)=>n+utf8.encode(JSON.stringify(r.file)).length,0)+utf8.encode(JSON.stringify(prior)).length;if(rows.length>=MAX_ARCHIVES||bytes>MAX_ARCHIVE_BYTES)throw Error('恢复归档达到容量上限，请导出并人工清理后重试');apply()});else apply();
 })},archive);
 return {...base,revision:revision+Number(changed),parts,manifest,metrics:{puts:delta.put.length+Number(changed)+(archive&&changed?1:0),deletes:delta.remove.length,bytes:delta.put.reduce((n,[,v])=>n+utf8.encode(v).length,0),headerBytes:changed?utf8.encode(JSON.stringify({revision:revision+1,mode:'active',manifest,sourceHash:base.sourceHash})).length:0}};
}
export async function commitShardWorkspace(db,base,values,legacy,options={}){
 values={...values};const result=await commitParts(db,base,splitSnapshot(values),legacy,options);
 return {...result,values:{...values}};
}
export async function retireShardWorkspace(db,base,legacy,{guard=false,checkRuntime=()=>{}}={}){
 checkRuntime();if(guard)assertShardWriter(legacy,base.sourceHash);
 const source=legacySnapshot(legacy);if(!source[STORAGE_KEY]||!exact(source,base.source)||await semanticDigest(source)!==await semanticDigest(base.values))throw Error('存在后续修改或原始数据已变化，不能无损回退；请导出恢复文件');
 await tx(db,'readwrite',(store,step)=>{store.get(headerKey(base.scope)).onsuccess=step(row=>{
  checkVersion(row?.value,base.revision);checkRuntime();if(guard)assertShardWriter(legacy,base.sourceHash);if(!exact(legacySnapshot(legacy),source))throw Error('原始数据已变化');
  store.put(record(base.scope,'header','',{revision:base.revision+1,mode:'retired',manifest:base.manifest,sourceHash:base.sourceHash}));
 })});
}
export function createShardStore(db,base,legacy,onStatus,{guard=false,checkRuntime=()=>{}}={}){
 const scope=base.scope;
 if(base.mode!=='active'||!exact(legacySnapshot(legacy),base.source))throw Error('存储已回退或旧客户端数据已变化');
 if(guard)assertShardWriter(legacy,base.sourceHash);checkRuntime();
 let {values,...current}=base,previous=null,metrics=null;
 const storage=createStateQueue(values,async(state,keys)=>{
  const plan=planStateParts(state,keys,bucket,previous);
  const next=await commitParts(db,current,plan.parts,legacy,{guard,checkRuntime});
  current=next;previous=plan;metrics={...next.metrics,reusedBuckets:plan.reused,serializedBuckets:plan.serialized};
 },onStatus);
 values=null;
 return {...storage,readCommitted:()=>readShardWorkspace(db,scope),metrics:()=>({...metrics,...storage.diagnostics()})};
}

export async function restoreShardRecovery(db,base,raw,legacy,options={}){
 const file=await parseRecovery(raw,base.scope);
 const saved=await commitShardWorkspace(db,base,file.values,legacy,{...options,archive:true});
 const check=await readShardWorkspace(db,base.scope);
 if(!check||check.revision!==saved.revision||await semanticDigest(check.values)!==file.sha256)throw Error('恢复后摘要不匹配，请导出恢复记录');
 return saved;
}
export async function readPriorRecovery(db,scope,revision){
 checkScope(scope);const row=await tx(db,'readonly',(_store,step,archives)=>{archives.get([scope,revision]).onsuccess=step(value=>value??null)},true);
 return row?(await parseRecovery(JSON.stringify(row.file),scope)).values:null;
}

export async function listRecoveryArchives(db,scope){
 checkScope(scope);return tx(db,'readonly',(_store,step,archives)=>{archives.getAll(scopeRange(scope)).onsuccess=step(rows=>rows.map(r=>({revision:r.revision,bytes:utf8.encode(JSON.stringify(r.file)).length,sha256:r.file?.sha256??null})))},true);
}
// Removal requires an independently imported and validated copy of precisely
// the archive, not merely a download click or a claimed success notification.
export async function removeVerifiedArchive(db,scope,revision,raw){
 const exported=await parseRecovery(raw,scope),original=await readPriorRecovery(db,scope,revision);
 if(!original||await semanticDigest(original)!==exported.sha256)throw Error('外部备份与归档不匹配');
 return tx(db,'readwrite',(_store,step,archives)=>{archives.get([scope,revision]).onsuccess=step(row=>{
  if(!row||row.file.sha256!==exported.sha256||JSON.stringify(row.file.values)!==JSON.stringify(original))throw Error('归档已变化，请重新验证');
  archives.delete([scope,revision]);
 })},true);
}
