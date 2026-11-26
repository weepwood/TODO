import {validImportRuns} from './import-receipt-validation.js';
export {validImportRuns} from './import-receipt-validation.js';
import {validPoints} from './points.js';
import {canonical,digest} from '../services/cloud-core.js';
import {validDate,validTime,newTask,migrateState} from './domain.js';
import {validDeadline} from './deadline.js';
import {safeLink} from './productivity.js';
export const EXCHANGE_FIELDS=['title','notes','date','time','deadline','duration','priority','points','planMinutes'];
export const EXCHANGE_LIMIT=1000,EXCHANGE_BYTES=1024*1024;
const names={title:['title','任务','标题','任务名称'],notes:['notes','备注'],date:['date','planned_date','计划日期'],time:['time','计划时间'],deadline:['deadline','截止日期','截止期限'],duration:['duration','预计时长'],priority:['priority','优先级'],points:['points','积分','任务积分'],planMinutes:['planminutes','plan_minutes','规划占位']};
export function parseCSV(raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>EXCHANGE_BYTES)throw Error('文件超过1 MiB');
 const s=raw.replace(/^\uFEFF/,''),rows=[];let row=[],cell='',quoted=false,closed=false;
 const push=()=>{if(cell.length>50000||row.length>=64)throw Error('字段过长或列数超过64');row.push(cell);cell='';closed=false};
 const line=()=>{push();if(row.some(v=>v!==''))rows.push(row);row=[];if(rows.length>EXCHANGE_LIMIT+1)throw Error('每批最多1000项')};
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(quoted){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}
  if(c===','){push();continue}
  if(c==='\r'||c==='\n'){if(c==='\r'&&s[i+1]==='\n')i++;line();continue}
  if(closed)throw Error('CSV 引号结束后存在非法字符');
  if(c==='"'){if(cell!=='')throw Error('CSV 引号位置无效');quoted=true}else cell+=c;
 }
 if(quoted)throw Error('CSV 引号未闭合');if(cell||row.length||closed)line();
 if(!rows.length)throw Error('CSV 缺少表头');
 const header=rows.shift().map(v=>v.trim());
 if(header.some(v=>!v)||new Set(header).size!==header.length)throw Error('表头为空或重复');
 return {header,rows};
}
export function inferMapping(header){return Object.fromEntries(EXCHANGE_FIELDS.map(k=>[k,header.findIndex(v=>names[k].includes(v.toLowerCase()))]))}
export function parseMarkdownTasks(raw,{obsidian=false,tree=false}={}){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>EXCHANGE_BYTES)throw Error('文件超过1 MiB');
 const rows=[],parents=[],links=[],stack=[];let ignored=0,previous=null,extended=false;let fenced=false;
 for(const line of raw.replace(/^\uFEFF/,'').split(/\r?\n/)){
  if(tree&&/^\s*(?:```|~~~)/.test(line)){fenced=!fenced;previous=null;continue}if(tree&&fenced){ignored++;continue}
  const meta=line.match(/^\s*<!-- todo-meta ([A-Za-z0-9+/=]+) -->\s*$/);
  if(meta&&previous){
   try{const decoded=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(meta[1]),c=>c.charCodeAt(0))),value=JSON.parse(decoded);
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error();
    if((obsidian||tree)&&typeof value.title==='string')previous[0]=value.title;
    if(tree&&value.links!==undefined){if(!Array.isArray(value.links)||value.links.length>30||value.links.some(l=>!l||typeof l.name!=='string'||l.name.length>100||typeof l.url!=='string'||l.url.length>2048||!safeLink(l.url)))throw Error();links[rows.length-1]=value.links}
    for(const k of EXCHANGE_FIELDS.slice(1)){const v=value[k];if(v!==undefined&&v!==null&&typeof v!=='string'&&typeof v!=='number')throw Error();previous[EXCHANGE_FIELDS.indexOf(k)]=String(v??'')}
    extended=true;
   }catch{throw Error('Markdown 属性记录无效')}
   previous=null;continue;
  }
  const match=line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
  previous=null;if(!match){if(line.trim())ignored++;continue}
  if(tree){
   const indent=line.match(/^\s*/)[0].replace(/\t/g,'    ').length;
   while(stack.length&&stack.at(-1).indent>=indent)stack.pop();
   if(match[1].toLowerCase()==='x'||stack.at(-1)?.skip){stack.push({indent,skip:true});ignored++;continue}
   parents.push(stack.at(-1)?.index??null);links.push([]);stack.push({indent,index:rows.length+1});
  }else if(match[1].toLowerCase()==='x'){ignored++;continue}
  let title=match[2],planned='',due='';
  if(obsidian){
   const suffix=title.match(/(?:\s+(?:⏳|📅)\s+\d{4}-\d{2}-\d{2})+\s*$/u);
   if(suffix){const pairs=[...suffix[0].matchAll(/(⏳|📅)\s+(\d{4}-\d{2}-\d{2})/gu)];
    if(pairs.every(([,k,v])=>validDate(v))&&new Set(pairs.map(p=>p[1])).size===pairs.length){for(const [,k,v] of pairs){if(k==='⏳')planned=v;else due=v}title=title.slice(0,suffix.index);extended=true}
   }
  }
  previous=[title.replace(/\\([\\\[\]<>*_`#])/g,'$1'),...EXCHANGE_FIELDS.slice(1).map(()=> '')];previous[EXCHANGE_FIELDS.indexOf('date')]=planned;previous[EXCHANGE_FIELDS.indexOf('deadline')]=due;rows.push(previous);
  if(rows.length>EXCHANGE_LIMIT)throw Error('每批最多1000项');
 }
 return {...(extended?{header:EXCHANGE_FIELDS,rows,ignored}:{header:['title'],rows:rows.map(r=>[r[0]]),ignored}),...(tree?{parents,links}:{})};
}
const key=t=>JSON.stringify([t.listId,t.title.normalize('NFKC').trim().toLocaleLowerCase(),t.date||'',t.time||'']);
export function previewExchange(parsed,mapping,listId,data){
 if(!data.lists.some(l=>l.id===listId))throw Error('目标清单不存在');
 if(!Number.isInteger(mapping.title)||mapping.title<0||mapping.title>=parsed.header.length)throw Error('必须映射任务名称');
 const seen=new Set(data.tasks.map(key)),rows=[];
 for(let i=0;i<parsed.rows.length;i++){
  const row=parsed.rows[i],get=k=>Number.isInteger(mapping[k])&&mapping[k]>=0?row[mapping[k]]??'':'';
  const title=get('title').trim(),notes=get('notes'),date=get('date').trim(),time=get('time').trim(),deadline=get('deadline').trim(),duration=get('duration').trim()?Number(get('duration')):30,priority=get('priority').trim()?Number(get('priority')):0;
  const points=get('points').trim()?Number(get('points')):undefined,planMinutes=get('planMinutes').trim()?Number(get('planMinutes')):undefined;
  const fields={title,notes,listId,date,time,deadline,duration,priority,...(points!==undefined?{points}:{}),...(planMinutes!==undefined?{planMinutes}:{})};
  let error=row.length!==parsed.header.length?'列数不匹配':!title||title.length>500?'任务名称为空或超过500字符':notes.length>50000?'备注超长':date&&!validDate(date)||time&&(!date||!validTime(time))||!validDeadline(deadline)?'日期或时间无效':!Number.isInteger(duration)||duration<1||duration>1440||![0,1,2,3].includes(priority)||points!==undefined&&!validPoints(points)||planMinutes!==undefined&&(!Number.isInteger(planMinutes)||planMinutes<1||planMinutes>1440)?'时长、积分或优先级无效':'';
  const signature=key(fields),duplicate=!error&&seen.has(signature);
  if(!error)seen.add(signature);const parentIndex=parsed.parents?.[i]??null;if(parentIndex!==null&&(rows[parentIndex-1]?.error||rows[parentIndex-1]?.duplicate))error='父任务不可导入';rows.push({index:i+1,fields:{...fields,...(parsed.links?.[i]?.length?{links:parsed.links[i]}:{})},error,duplicate,...(parentIndex!==null?{parentIndex}:{})});
 }
 return rows;
}
export function makeImportTasks(rows){
 const accepted=rows.filter(r=>!r.error&&!r.duplicate),byIndex=new Map(accepted.map(r=>[r.index,{...newTask(r.fields.title,r.fields.listId,r.fields.date),...r.fields}]));
 for(const r of accepted)if(r.parentIndex!==undefined&&r.parentIndex!==null){const parent=byIndex.get(r.parentIndex);if(!parent)throw Error('请同时选择父任务，避免导入孤立子任务');byIndex.get(r.index).parentId=parent.id}
 return [...byIndex.values()];
}
export function appendImportedTasks(data,tasks,receipt){
 if(!tasks.length||tasks.length>EXCHANGE_LIMIT||data.tasks.length+tasks.length>100000)return data;
 const ids=new Set(data.tasks.map(t=>t.id)),keys=new Set(data.tasks.map(key));
 for(const t of tasks){const k=key(t);if(ids.has(t.id)||keys.has(k)||!data.lists.some(l=>l.id===t.listId))return data;ids.add(t.id);keys.add(k)}
 const next={...data,tasks:[...data.tasks,...tasks]};
 if(receipt){const run={id:receipt.id,at:receipt.at,entries:receipt.entries||tasks.map(t=>({id:t.id,signature:importSignature(t)}))};if(run.entries.length!==tasks.length||run.entries.some((e,i)=>e.id!==tasks[i].id))return data;const runs=[run,...(data.importRuns||[])].slice(0,10);while(runs.length>1&&!validImportRuns(runs))runs.pop();if(!validImportRuns(runs))return data;next.importRuns=runs}
 try{migrateState(next);return next}catch{return data}
}
const csvCell=value=>{let s=String(value??'');if(typeof value!=='number'&&/^[\s]*[=+\-@]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
export function exportTasks(tasks,format){
 const active=tasks.filter(t=>t.status==='pending'&&!t.deletedAt);
 if(format==='markdown-tree'){
  const byParent=new Map(),ids=new Set(active.map(t=>t.id));
  for(const t of active){const parent=ids.has(t.parentId)?t.parentId:null;if(!byParent.has(parent))byParent.set(parent,[]);byParent.get(parent).push(t)}
  const seen=new Set(),ordered=[],stack=[...(byParent.get(null)||[])].reverse().map(t=>[t,0]);
  while(stack.length){const [t,depth]=stack.pop();if(seen.has(t.id))continue;seen.add(t.id);ordered.push([t,depth]);for(const child of [...(byParent.get(t.id)||[])].reverse())stack.push([child,depth+1])}
  if(ordered.length!==active.length||ordered.some(([,d])=>d>30))throw Error('任务层级异常或超过30层，请使用完整工作空间备份');
  return ordered.map(([t,depth])=>{const indent='  '.repeat(depth),title=t.title.replace(/[\r\n]+/g,' ').replace(/[\\\[\]<>*_`#]/g,'\\$&'),metadata=JSON.stringify({...Object.fromEntries(EXCHANGE_FIELDS.slice(1).filter(k=>t[k]!==undefined).map(k=>[k,t[k]])),title:t.title,links:t.links||[]});
   return indent+'- [ ] '+title+'\n'+indent+'  <!-- todo-meta '+btoa(Array.from(new TextEncoder().encode(metadata),n=>String.fromCharCode(n)).join(''))+' -->';
  }).join('\n')+'\n';
 }
 if(format==='markdown'||format==='obsidian')return active.map(t=>{
  const title=t.title.replace(/[\r\n]+/g,' ').replace(/[\\\[\]<>*_\x60#]/g,'\\$&');
  const metadata=JSON.stringify({...Object.fromEntries(EXCHANGE_FIELDS.slice(1).filter(k=>t[k]!==undefined).map(k=>[k,t[k]])),...(format==='obsidian'?{title:t.title}:{})});
  const encoded=btoa(Array.from(new TextEncoder().encode(metadata),n=>String.fromCharCode(n)).join(''));
  return '- [ ] '+title+(format==='obsidian'?(validDate(t.date)?' ⏳ '+t.date:'')+(validDeadline(t.deadline)&&t.deadline?' 📅 '+t.deadline.slice(0,10):''):'')+'\n  <!-- todo-meta '+encoded+' -->';
 }).join('\n')+'\n';
 return '\uFEFF'+[EXCHANGE_FIELDS.join(','),...active.map(t=>EXCHANGE_FIELDS.map(k=>csvCell(t[k])).join(','))].join('\r\n');
}

function importSignature(task){const {activity,...fields}=task;return canonical(fields)}
export function canUndoImport(data,id,proof){
 const run=data.importRuns?.find(r=>r.id===id);if(!run||run.undone||!validImportRuns([run]))return false;
 const ids=new Set(run.entries.map(e=>e.id)),byId=new Map(data.tasks.map(t=>[t.id,t]));
 if(data.timer&&ids.has(data.timer.taskId)||data.sessions.some(s=>ids.has(s.taskId))||data.tasks.some(t=>!t.deletedAt&&!ids.has(t.id)&&(ids.has(t.parentId)||t.dependsOn?.some(x=>ids.has(x))||ids.has(t.previousId))))return false;
 return run.entries.every(e=>{const t=byId.get(e.id);return t&&!t.deletedAt&&t.status==='pending'&&(e.signature.startsWith('sha256:')?proof?.get(e.id)?.signature===e.signature&&proof.get(e.id).canonical===importSignature(t):importSignature(t)===e.signature)&&(t.activity||[]).every(a=>a.kind==='created')});
}
export function undoImport(data,id,at,proof){
 if(!Number.isFinite(Date.parse(at))||!canUndoImport(data,id,proof))return data;
 const run=data.importRuns.find(r=>r.id===id),ids=new Set(run.entries.map(e=>e.id));
 return {...data,tasks:data.tasks.map(t=>ids.has(t.id)?{...t,deletedAt:at}:t),importRuns:data.importRuns.map(r=>r.id===id?{...r,undone:true}:r)};
}

// Cryptographic work happens before the synchronous workspace transaction.
// A proof is ephemeral and is rechecked against the current exact task content.
export async function prepareImportReceipt(tasks,receipt){
 return {...receipt,entries:await Promise.all(tasks.map(async t=>({id:t.id,signature:'sha256:'+await digest(importSignature(t))})))};
}
export async function verifyImportUndo(data,id){
 const run=data.importRuns?.find(r=>r.id===id),proof=new Map();if(!run)return proof;
 const byId=new Map(data.tasks.map(t=>[t.id,t]));
 for(const e of run.entries){const t=byId.get(e.id);if(!t||!e.signature.startsWith('sha256:'))continue;
  const canonical=importSignature(t),signature='sha256:'+await digest(canonical);
  if(signature===e.signature)proof.set(e.id,{canonical,signature});
 }
 return proof;
}
export async function compactImportReceipts(runs){
 return Promise.all(runs.map(async r=>({...r,entries:await Promise.all(r.entries.map(async e=>e.signature.startsWith('sha256:')?e:{id:e.id,signature:'sha256:'+await digest(e.signature)}))})));
}
