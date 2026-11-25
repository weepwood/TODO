import {dayKey,shiftDay} from './domain.js';
export const SMART_KEY='todo-smart-lists-v1';
export const emptyFilter={name:'',text:'',status:'pending',date:'any',priority:'any',listId:'',tagId:'',repeat:'any',timed:'any'};
export function normalizeFilter(input={}){
 const f={...emptyFilter,...input};
 const one=(v,allowed,d)=>allowed.includes(v)?v:d;
 return {id:typeof f.id==='string'?f.id:'',name:String(f.name||'').trim().slice(0,80),text:String(f.text||'').trim().slice(0,200),status:one(f.status,['pending','completed','all'],'pending'),date:one(f.date,['any','today','overdue','next7','none'],'any'),priority:one(String(f.priority),['any','0','1','2','3'],'any'),listId:typeof f.listId==='string'?f.listId:'',tagId:typeof f.tagId==='string'?f.tagId:'',repeat:one(f.repeat,['any','yes','no'],'any'),timed:one(f.timed,['any','yes','no'],'any')};
}
export function smartMatches(t,f,today=dayKey()){
 if(t.deletedAt||(f.status==='all'?t.status==='skipped':t.status!==f.status))return false;
 if(f.listId&&t.listId!==f.listId||f.tagId&&!t.tags?.includes(f.tagId)||f.priority!=='any'&&String(t.priority)!==f.priority)return false;
 if(f.date==='today'&&t.date!==today||f.date==='overdue'&&(!t.date||t.date>=today)||f.date==='next7'&&(!t.date||t.date<today||t.date>shiftDay(today,6))||f.date==='none'&&t.date)return false;
 if(f.repeat!=='any'&&(t.repeat!=='none')!==(f.repeat==='yes')||f.timed!=='any'&&!!t.time!==(f.timed==='yes'))return false;
 return !f.text||(t.title+' '+t.notes).toLowerCase().includes(f.text.toLowerCase());
}
export function readSmartLists(storage){try{const a=JSON.parse(storage.getItem(SMART_KEY)||'[]');if(!Array.isArray(a))return [];const ids=new Set();return a.slice(0,100).map(normalizeFilter).filter(f=>f.id&&f.name&&!ids.has(f.id)&&ids.add(f.id))}catch{return []}}
export function matchingTask(t,view,filters,today,fallback){if(!view.startsWith('smart:'))return fallback(t,view,today);const f=filters.find(x=>x.id===view.slice(6));return !!f&&smartMatches(t,f,today)}
