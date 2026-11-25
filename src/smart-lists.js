import {dayKey,shiftDay} from './domain.js';
export const SMART_KEY='todo-smart-lists-v1';
export const emptyFilter={name:'',text:'',mode:'all',status:'pending',date:'any',priority:'any',listId:'',tagId:'',repeat:'any',timed:'any'};
export function normalizeFilter(input={}){
 const f={...emptyFilter,...input};
 const one=(v,allowed,d)=>allowed.includes(v)?v:d;
 return {mode:one(f.mode,['all','any'],'all'),id:typeof f.id==='string'?f.id:'',name:String(f.name||'').trim().slice(0,80),text:String(f.text||'').trim().slice(0,200),status:one(f.status,['pending','completed','all'],'pending'),date:one(f.date,['any','today','overdue','next7','none'],'any'),priority:one(String(f.priority),['any','0','1','2','3'],'any'),listId:typeof f.listId==='string'?f.listId:'',tagId:typeof f.tagId==='string'?f.tagId:'',repeat:one(f.repeat,['any','yes','no'],'any'),timed:one(f.timed,['any','yes','no'],'any')};
}
export function smartMatches(t,f,today=dayKey()){
 if(t.deletedAt||(f.status==='all'?t.status==='skipped':t.status!==f.status))return false;
 const tests=[];
 if(f.listId)tests.push(t.listId===f.listId);
 if(f.tagId)tests.push(!!t.tags?.includes(f.tagId));
 if(f.priority!=='any')tests.push(String(t.priority)===f.priority);
 if(f.date!=='any')tests.push(f.date==='today'?t.date===today:f.date==='overdue'?!!t.date&&t.date<today:f.date==='next7'?!!t.date&&t.date>=today&&t.date<=shiftDay(today,6):!t.date);
 if(f.repeat!=='any')tests.push((t.repeat!=='none')===(f.repeat==='yes'));
 if(f.timed!=='any')tests.push(!!t.time===(f.timed==='yes'));
 if(f.text)tests.push((t.title+' '+t.notes).toLowerCase().includes(f.text.toLowerCase()));
 return !tests.length||(f.mode==='any'?tests.some(Boolean):tests.every(Boolean));
}
export function validSmartLists(items){return Array.isArray(items)&&items.length<=100&&items.every(f=>f&&typeof f==='object'&&typeof f.id==='string'&&f.id.length>0&&f.id.length<=200&&typeof f.name==='string'&&f.name.trim().length>0&&f.name.length<=80&&typeof f.text==='string'&&f.text.length<=200&&['all','any'].includes(f.mode||'all')&&['pending','completed','all'].includes(f.status)&&['any','today','overdue','next7','none'].includes(f.date)&&['any','0','1','2','3'].includes(f.priority)&&typeof f.listId==='string'&&typeof f.tagId==='string'&&['any','yes','no'].includes(f.repeat)&&['any','yes','no'].includes(f.timed))&&new Set(items.map(f=>f.id)).size===items.length}
export function readSmartLists(storage){try{const a=JSON.parse(storage.getItem(SMART_KEY)||'[]');if(!Array.isArray(a))return [];const ids=new Set();return a.slice(0,100).filter(f=>f&&typeof f==='object').map(normalizeFilter).filter(f=>f.id&&f.name&&!ids.has(f.id)&&ids.add(f.id))}catch{return []}}
export function matchingTask(t,view,filters,today,fallback){if(!view.startsWith('smart:'))return fallback(t,view,today);const f=filters.find(x=>x.id===view.slice(6));return !!f&&smartMatches(t,f,today)}
