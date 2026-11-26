import {assertLegacyWriter} from './storage-switch-protocol.js';
import {initialState,migrateState,STORAGE_KEY} from '../core/domain.js';
import {STORE_KEYS,createNativeStore} from './native-store.js';

// Experimental guest-only repository. Never deletes or writes the legacy source.
// IndexedDB transaction completion, not request success, is the durability boundary.
export const PILOT_DB='todo-web-workspace-pilot-v1',PILOT_SCOPE='guest';
const TABLE='workspaces';
const same=(a,b)=>STORE_KEYS.every(k=>(a[k]??null)===(b[k]??null));
export function legacySnapshot(storage){const values={};for(const key of STORE_KEYS){const v=storage.getItem(key);if(v!==null)values[key]=v}return values}
const isSnapshot=values=>!!values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).every(k=>STORE_KEYS.includes(k)&&typeof values[k]==='string');
function validate(values){if(!isSnapshot(values)||!values[STORAGE_KEY])throw Error('工作空间快照无效');migrateState(JSON.parse(values[STORAGE_KEY]));return values}
function validateRecord(row){if(!row||row.scope!==PILOT_SCOPE||!Number.isSafeInteger(row.revision)||row.revision<1||!['active','retired'].includes(row.mode)||!isSnapshot(row.source))throw Error('IndexedDB 工作空间记录无效');validate(row.values);return row}
export function openPilotDatabase(factory=globalThis.indexedDB){
 if(!factory)return Promise.reject(Error('浏览器不支持 IndexedDB'));
 return new Promise((resolve,reject)=>{let failed=false;const request=factory.open(PILOT_DB,1);
  request.onupgradeneeded=()=>{request.result.createObjectStore(TABLE,{keyPath:'scope'})};
  request.onblocked=()=>{failed=true;reject(Error('IndexedDB 升级被其他标签页阻塞'))};
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result;if(failed){db.close();return}db.onversionchange=()=>db.close();resolve(db)};
 });
}
// No await inside the request callback: Safari can auto-commit idle transactions.
function transact(db,mode,operation){
 return new Promise((resolve,reject)=>{
  let tx,output,error;
  try{tx=mode==='readwrite'?db.transaction(TABLE,mode,{durability:'strict'}):db.transaction(TABLE,mode)}catch(e){if(mode==='readwrite'&&e instanceof TypeError){try{tx=db.transaction(TABLE,mode)}catch(f){reject(f);return}}else{reject(e);return}}
  tx.oncomplete=()=>resolve(output);
  tx.onabort=()=>reject(error||tx.error||Error('IndexedDB 事务已中止'));
  tx.onerror=()=>{ /* onabort reports the failed transaction */ };
  const store=tx.objectStore(TABLE),req=store.get(PILOT_SCOPE);
  req.onsuccess=()=>{try{output=operation(req.result,store)}catch(e){error=e;tx.abort()}};
 });
}
export async function loadOrMigrate(db,legacy){
 const source=legacySnapshot(legacy);
 return transact(db,'readwrite',(existing,store)=>{
  if(existing){const row=validateRecord(existing);if(row.mode!=='active')throw Error('试验工作空间已回滚，请导出恢复记录');if(!same(source,row.source))throw Error('原始工作空间已变化，禁止自动覆盖或回退');return row}
  if(!source[STORAGE_KEY]&&Object.keys(source).length)throw Error('原始主数据缺失，保留现有备份并等待人工恢复');
  const values=validate({...source,[STORAGE_KEY]:source[STORAGE_KEY]??JSON.stringify(initialState())});
  const row={scope:PILOT_SCOPE,revision:1,mode:'active',source,values};store.add(row);return row;
 });
}
export function readRawPilotRecord(db){return transact(db,'readonly',row=>row??null)}
export function readPilotRecord(db){return transact(db,'readonly',row=>row?validateRecord(row):null)}
export function commitPilotSnapshot(db,expected,values){
 validate(values);
 return transact(db,'readwrite',(existing,store)=>{
  const row=validateRecord(existing);
  if(row.mode!=='active'||row.revision!==expected||row.revision===Number.MAX_SAFE_INTEGER)throw Error('工作空间版本冲突，保留当前草稿并导出后重新打开');
  const next={...row,revision:row.revision+1,values:{...values}};store.put(next);return next;
 });
}
// Reverting to the legacy reader is safe only if it contains the exact current
// data. A changed/oversized workspace must be exported, not silently rolled back.
export function rollbackPilot(db,legacy,expected){
 const source=legacySnapshot(legacy);
 return transact(db,'readwrite',(existing,store)=>{
  const row=validateRecord(existing);
  if(row.mode!=='active'||row.revision!==expected||row.revision===Number.MAX_SAFE_INTEGER||!same(source,row.source)||!same(row.values,source))throw Error('回滚将丢失修改或原始数据已变化，请先导出并人工恢复');
  const retired={...row,revision:row.revision+1,mode:'retired'};store.put(retired);return retired;
 });
}
export async function createWebPilotStore(db,legacy,onStatus){
 assertLegacyWriter(legacy);
 let row=await loadOrMigrate(db,legacy);
 const storage=createNativeStore(row.values,async values=>{assertLegacyWriter(legacy);if(!same(legacySnapshot(legacy),row.source))throw Error('原始工作空间已变化，请导出当前草稿并重新打开');row=await commitPilotSnapshot(db,row.revision,values)},onStatus);
 return {...storage,readCommitted:()=>readPilotRecord(db)};
}
