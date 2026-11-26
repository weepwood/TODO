import {sameRecord} from './record-equality.js';
import {quickParse} from './advanced.js';
import {taskFromCapture} from './task-defaults.js';
import {migrateState} from './domain.js';
import {validDeadline} from './deadline.js';
import {blockPatch} from './plan-block.js';
export function previewCapture(text,today){
 const lines=String(text).split(/\r?\n/).map((s,i)=>({text:s.trim(),line:i+1})).filter(r=>r.text);
 if(lines.length>100||text.length>50000)throw Error('每批最多100项、50000字符');
 return lines.map(r=>{const parsed=quickParse(r.text,today);return {...r,parsed,error:!parsed.title||parsed.title.length>500?'标题为空或超过500字符':''}});
}
export function captureBatch(data,rows,listId,today,defaults){
 const tasks=prepareCapture(data,rows,listId,today,defaults);return appendCapture(data,tasks);
}
export function prepareCapture(data,rows,listId,today,defaults){
 const list=data.lists.find(l=>l.id===listId);
 if(!list||!rows.length||rows.length>100||rows.some(r=>r.error||!r.parsed?.title)||data.tasks.length+rows.length>100000)return [];
 return rows.map(r=>taskFromCapture({parsed:r.parsed,list,today,defaults}));
}
export function appendCapture(data,tasks){
 if(!tasks.length||tasks.length>100||data.tasks.length+tasks.length>100000)return data;
 const ids=new Set(data.tasks.map(t=>t.id));
 if(new Set(tasks.map(t=>t.id)).size!==tasks.length||tasks.some(t=>ids.has(t.id)||!data.lists.some(l=>l.id===t.listId&&(!t.sectionId||l.sections.some(s=>s.id===t.sectionId)))))return data;
 const next={...data,tasks:[...data.tasks,...tasks]};try{migrateState(next);return next}catch{return data}
}
const editable=t=>t.status==='pending'&&!t.deletedAt;
export function previewBulkProperties(data,ids,fields){
 const allowed=['duration','deadline','priority','sectionId','listId'];if(!Object.keys(fields).length||Object.keys(fields).some(k=>!allowed.includes(k)))return [];
 if('duration'in fields&&(!Number.isInteger(fields.duration)||fields.duration<1||fields.duration>1440)||'deadline'in fields&&!validDeadline(fields.deadline)||'priority'in fields&&![0,1,2,3].includes(fields.priority))return [];
 if('listId'in fields&&(!Object.hasOwn(fields,'sectionId')||!data.lists.some(l=>l.id===fields.listId)))return [];
 if(!Array.isArray(ids)||ids.length>100||new Set(ids).size!==ids.length)return [];
 const selected=new Set(ids);
 return data.tasks.filter(t=>selected.has(t.id)&&editable(t)&&blockPatch(t,fields)&&(!Object.hasOwn(fields,'sectionId')||fields.sectionId===null||data.lists.find(l=>l.id===(fields.listId??t.listId))?.sections.some(s=>s.id===fields.sectionId))).map(t=>({id:t.id,title:t.title,listId:t.listId,before:Object.fromEntries(Object.keys(fields).map(k=>[k,t[k]??null]))})).filter(r=>Object.keys(fields).some(k=>r.before[k]!==fields[k]));
}
export function applyBulkProperties(data,rows,fields){
 if(!rows.length||JSON.stringify(previewBulkProperties(data,rows.map(r=>r.id),fields))!==JSON.stringify(rows))return data;
 const ids=new Set(rows.map(r=>r.id));return {...data,tasks:data.tasks.map(t=>ids.has(t.id)?{...t,...fields}:t)};
}
export function reorderChecklist(items,id,delta){
 const a=items.findIndex(x=>x.id===id),b=a+delta;if(a<0||![-1,1].includes(delta)||b<0||b>=items.length)return items;
 const next=items.slice();[next[a],next[b]]=[next[b],next[a]];return next;
}
export function workspaceDiff(current,incoming){
 const fields=['tasks','lists','tags','habits','sessions','templates','calendarEvents'];
 return fields.map(key=>{const a=new Map((current[key]||[]).map(x=>[x.id,x])),b=new Map((incoming[key]||[]).map(x=>[x.id,x]));let added=0,removed=0,changed=0;for(const [id,row] of b){if(!a.has(id))added++;else if(!sameRecord(a.get(id),row))changed++}for(const id of a.keys())if(!b.has(id))removed++;return {key,added,removed,changed,unchanged:b.size-added-changed}});
}


// Explicitly retained local draft; a stale draft can be copied but never applied.
export const noteDraftKey=id=>'todo-note-draft-v1:'+encodeURIComponent(id);
export function readNoteDraft(storage,id){
 const raw=storage.getItem(noteDraftKey(id));if(raw===null)return null;
 const r=JSON.parse(raw);if(!r||typeof r.base!=='string'||typeof r.text!=='string'||r.base.length>50000||r.text.length>50000||!Number.isFinite(Date.parse(r.at)))throw Error('草稿记录无效，原记录保留');
 return r;
}
export function saveNoteDraft(storage,id,base,text,at){
 if(typeof base!=='string'||typeof text!=='string'||base.length>50000||text.length>50000||!Number.isFinite(Date.parse(at)))throw Error('草稿超出保存范围');
 const row={base,text,at};storage.setItem(noteDraftKey(id),JSON.stringify(row));return row;
}
