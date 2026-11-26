import {validDate,validTime,newTask,migrateState} from './domain.js';
import {validDeadline} from './deadline.js';
export const EXCHANGE_FIELDS=['title','notes','date','time','deadline','duration','priority'];
export const EXCHANGE_LIMIT=1000,EXCHANGE_BYTES=1024*1024;
const names={title:['title','任务','标题','任务名称'],notes:['notes','备注'],date:['date','planned_date','计划日期'],time:['time','计划时间'],deadline:['deadline','截止日期','截止期限'],duration:['duration','预计时长'],priority:['priority','优先级']};
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
export function parseMarkdownTasks(raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>EXCHANGE_BYTES)throw Error('文件超过1 MiB');
 const rows=[];let ignored=0;
 for(const line of raw.replace(/^\uFEFF/,'').split(/\r?\n/)){
  const match=line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
  if(!match){if(line.trim())ignored++;continue}
  if(match[1].toLowerCase()==='x'){ignored++;continue}
  rows.push([match[2].replace(/\\([\\\[\]<>*_`#])/g,'$1')]);if(rows.length>EXCHANGE_LIMIT)throw Error('每批最多1000项');
 }
 return {header:['title'],rows,ignored};
}
const key=t=>JSON.stringify([t.listId,t.title.normalize('NFKC').trim().toLocaleLowerCase(),t.date||'',t.time||'']);
export function previewExchange(parsed,mapping,listId,data){
 if(!data.lists.some(l=>l.id===listId))throw Error('目标清单不存在');
 if(!Number.isInteger(mapping.title)||mapping.title<0||mapping.title>=parsed.header.length)throw Error('必须映射任务名称');
 const seen=new Set(data.tasks.map(key)),rows=[];
 for(let i=0;i<parsed.rows.length;i++){
  const row=parsed.rows[i],get=k=>Number.isInteger(mapping[k])&&mapping[k]>=0?row[mapping[k]]??'':'';
  const title=get('title').trim(),notes=get('notes'),date=get('date').trim(),time=get('time').trim(),deadline=get('deadline').trim(),duration=get('duration').trim()?Number(get('duration')):30,priority=get('priority').trim()?Number(get('priority')):0;
  const fields={title,notes,listId,date,time,deadline,duration,priority};
  let error=row.length!==parsed.header.length?'列数不匹配':!title||title.length>500?'任务名称为空或超过500字符':notes.length>50000?'备注超长':date&&!validDate(date)||time&&(!date||!validTime(time))||!validDeadline(deadline)?'日期或时间无效':!Number.isInteger(duration)||duration<1||duration>1440||![0,1,2,3].includes(priority)?'时长或优先级无效':'';
  const signature=key(fields),duplicate=!error&&seen.has(signature);
  if(!error)seen.add(signature);rows.push({index:i+1,fields,error,duplicate});
 }
 return rows;
}
export function makeImportTasks(rows){return rows.filter(r=>!r.error&&!r.duplicate).map(r=>({...newTask(r.fields.title,r.fields.listId,r.fields.date),...r.fields}))}
export function appendImportedTasks(data,tasks){
 if(!tasks.length||tasks.length>EXCHANGE_LIMIT||data.tasks.length+tasks.length>100000)return data;
 const ids=new Set(data.tasks.map(t=>t.id)),keys=new Set(data.tasks.map(key));
 for(const t of tasks){const k=key(t);if(ids.has(t.id)||keys.has(k)||!data.lists.some(l=>l.id===t.listId))return data;ids.add(t.id);keys.add(k)}
 const next={...data,tasks:[...data.tasks,...tasks]};
 try{migrateState(next);return next}catch{return data}
}
const csvCell=value=>{let s=String(value??'');if(/^[\s]*[=+\-@]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
export function exportTasks(tasks,format){
 const active=tasks.filter(t=>t.status==='pending'&&!t.deletedAt);
 if(format==='markdown')return active.map(t=>'- [ ] '+t.title.replace(/[\r\n]+/g,' ').replace(/[\\\[\]<>*_`#]/g,'\\$&')).join('\n')+'\n';
 return '\uFEFF'+[EXCHANGE_FIELDS.join(','),...active.map(t=>EXCHANGE_FIELDS.map(k=>csvCell(t[k])).join(','))].join('\r\n');
}
