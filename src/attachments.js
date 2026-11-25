const DB='todo-local-attachments-v1',STORE='files';
export const FILE_LIMIT=10*1024*1024,SCOPE_LIMIT=50*1024*1024,TASK_LIMIT=20;
export function validateAttachment(file){if(!file||!Number.isSafeInteger(file.size)||file.size<=0||file.size>FILE_LIMIT)throw Error('文件必须大于 0 且不超过 10 MB');if(typeof file.name!=='string'||!file.name.trim()||file.name.length>255)throw Error('文件名称无效');return true}
function open(){return new Promise((resolve,reject)=>{const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>{const s=q.result.createObjectStore(STORE,{keyPath:'id'});s.createIndex('scope','scope');s.createIndex('task',['scope','taskId'])};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('附件存储被其他窗口占用'))})}
function transact(db,mode,work){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode),s=tx.objectStore(STORE);let result,reason;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(reason||tx.error||Error('附件事务中止'));tx.onerror=()=>{};try{work(s,v=>result=v,e=>{reason=e;tx.abort()})}catch(e){reason=e;tx.abort()}})}
const metadata=({blob,...rest})=>rest;
export async function attachmentHash(blob){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('')}
export function attachmentIdentity(x){return JSON.stringify([x.taskId,x.name,x.size,x.sha256])}
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);

export async function listAttachments(scope,taskId){const db=await open();try{return await transact(db,'readonly',(s,done)=>{const items=[],q=(taskId?s.index('task').openCursor(IDBKeyRange.only([scope,taskId])):s.index('scope').openCursor(IDBKeyRange.only(scope)));q.onsuccess=()=>{const c=q.result;if(c){items.push(metadata(c.value));c.continue()}else done(items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)))}})}finally{db.close()}}
export async function addAttachment(scope,taskId,file){validateAttachment(file);const sha256=await attachmentHash(file);const db=await open();try{return await transact(db,'readwrite',(s,done,fail)=>{let total=0,count=0;const q=s.index('scope').openCursor(IDBKeyRange.only(scope));q.onsuccess=()=>{const c=q.result;if(c){total+=c.value.size;if(c.value.taskId===taskId)count++;c.continue();return}if(total+file.size>SCOPE_LIMIT||count>=TASK_LIMIT){fail(Error('附件容量已达上限（每账号 50 MB，每任务 20 个）'));return}const record={id:crypto.randomUUID(),scope,taskId,name:file.name,size:file.size,createdAt:new Date().toISOString(),sha256,blob:file};s.add(record);done(metadata(record))}})}finally{db.close()}}
export async function readAttachment(scope,id){const db=await open();try{return await transact(db,'readonly',(s,done,fail)=>{const q=s.get(id);q.onsuccess=()=>{if(q.result?.scope!==scope){fail(Error('附件不存在'));return}done(q.result)}})}finally{db.close()}}
export async function removeAttachment(scope,id){const db=await open();try{return await transact(db,'readwrite',(s,done,fail)=>{const q=s.get(id);q.onsuccess=()=>{if(q.result?.scope!==scope){fail(Error('附件不存在'));return}s.delete(id);done(true)}})}finally{db.close()}}
export async function downloadAttachment(scope,id){const record=await readAttachment(scope,id);const url=URL.createObjectURL(record.blob);const a=document.createElement('a');a.href=url;a.download=record.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

export async function readAllAttachmentRecords(scope){const db=await open();try{return await transact(db,'readonly',(s,done)=>{const q=s.index('scope').getAll(IDBKeyRange.only(scope));q.onsuccess=()=>done(q.result)})}finally{db.close()}}
export async function appendAttachmentRecords(scope,entries){
 // Hash immutable legacy blobs outside the write transaction; IndexedDB must not
 // await asynchronous digest operations while a transaction is open.
 const legacy=new Map();
 for(const x of await readAllAttachmentRecords(scope))if(!validHash(x.sha256))legacy.set(x.id,await attachmentHash(x.blob));
 const verified=[];
 for(const x of entries){validateAttachment(x);if(!x.blob||x.blob.size!==x.size)throw Error('附件内容长度无效');const hash=await attachmentHash(x.blob);if(x.sha256&&hash!==x.sha256)throw Error('附件内容校验失败');verified.push({...x,sha256:hash})}
 const db=await open();try{return await transact(db,'readwrite',(s,done,fail)=>{
  const counts=new Map(),seen=new Set();let total=0;
  const q=s.index('scope').openCursor(IDBKeyRange.only(scope));q.onsuccess=()=>{
   const c=q.result;
   if(c){
    const v=c.value,hash=validHash(v.sha256)?v.sha256:legacy.get(v.id);
    if(!hash){fail(Error('附件在检查期间发生变化，请重试恢复'));return}
    if(!validHash(v.sha256))c.update({...v,sha256:hash});
    seen.add(attachmentIdentity({...v,sha256:hash}));total+=v.size;counts.set(v.taskId,(counts.get(v.taskId)||0)+1);c.continue();return;
   }
   const additions=[];let skipped=0;
   for(const x of verified){const key=attachmentIdentity(x);if(seen.has(key)){skipped++;continue}seen.add(key);total+=x.size;counts.set(x.taskId,(counts.get(x.taskId)||0)+1);if(total>SCOPE_LIMIT||counts.get(x.taskId)>TASK_LIMIT){fail(Error('导入后将超过本机附件容量；未写入任何文件'));return}additions.push(x)}
   for(const x of additions)s.add({...x,id:crypto.randomUUID(),scope});
   done({added:additions.length,skipped});
  }
 })}finally{db.close()}
}
