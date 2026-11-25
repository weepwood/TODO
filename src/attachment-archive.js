import {FILE_LIMIT,SCOPE_LIMIT,TASK_LIMIT,validateAttachment,readAllAttachmentRecords,appendAttachmentRecords} from './attachments.js';
export const ARCHIVE_LIMIT=72*1024*1024;
async function checksum(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')}
function encode(bytes){let out='';for(let i=0;i<bytes.length;i+=32768)out+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(out)}
function decode(text){const raw=atob(text),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes}
export async function makeAttachmentArchive(scope){
 const files=await readAllAttachmentRecords(scope),entries=[];if(files.length>1000)throw Error('附件超过 1000 个，无法生成单个归档，请先整理或逐个下载');
 for(const file of files){const bytes=new Uint8Array(await file.blob.arrayBuffer());entries.push({taskId:file.taskId,name:file.name,size:file.size,createdAt:file.createdAt,sha256:await checksum(bytes),data:encode(bytes)})}
 const archive={format:'todo-attachment-archive',version:1,createdAt:new Date().toISOString(),entries};if(new Blob([JSON.stringify(archive)]).size>ARCHIVE_LIMIT)throw Error('归档超过 72 MiB');return archive;
}
export async function parseAttachmentArchive(file){
 if(!file||file.size>ARCHIVE_LIMIT)throw Error('附件归档超过 72 MiB');
 const a=JSON.parse(await file.text());if(a?.format!=='todo-attachment-archive'||a.version!==1||!Array.isArray(a.entries)||a.entries.length>1000)throw Error('不支持的附件归档');
 const entries=[],counts=new Map();let total=0;
 for(const x of a.entries){
  validateAttachment(x);if(typeof x.taskId!=='string'||!x.taskId||x.taskId.length>200||typeof x.createdAt!=='string'||!Number.isFinite(Date.parse(x.createdAt))||typeof x.data!=='string'||x.data.length!==Math.ceil(x.size/3)*4||!(/^[a-f0-9]{64}$/).test(x.sha256||''))throw Error('归档条目无效');
  total+=x.size;counts.set(x.taskId,(counts.get(x.taskId)||0)+1);if(total>SCOPE_LIMIT||counts.get(x.taskId)>TASK_LIMIT)throw Error('归档超过附件容量限制');
  const bytes=decode(x.data);if(bytes.length!==x.size||await checksum(bytes)!==x.sha256)throw Error('文件校验失败：'+x.name);
  entries.push({taskId:x.taskId,name:x.name,size:x.size,createdAt:x.createdAt,sha256:x.sha256,blob:new Blob([bytes])});
 }
 return entries;
}
export async function restoreAttachmentArchive(scope,entries){return appendAttachmentRecords(scope,entries)}
