import {id,validDate,validTime,shiftDay,dayKey} from './domain.js';
export const RULE_KEY='todo-workflow-rules-v1';
const conditions=['overdue','unscheduled','today','any','high','unblocked','doing','todo'];
const actions=['today','tomorrow','high','low','clear-date','doing','todo','closeout'];
const triggers=['daily','created','completed','changed','time','manual'];
export function validRule(r){return !!r&&typeof r.id==='string'&&typeof r.name==='string'&&r.name.trim().length>0&&r.name.length<=80&&typeof r.list==='string'&&conditions.includes(r.condition)&&actions.includes(r.action)&&typeof r.enabled==='boolean'&&(r.extra===undefined||conditions.includes(r.extra))&&(r.match===undefined||['all','any'].includes(r.match))&&(r.trigger===undefined||triggers.includes(r.trigger))&&(r.trigger!=='time'||validTime(r.at))&&(r.tag===undefined||typeof r.tag==='string')}
export function readRules(storage){const raw=storage.getItem(RULE_KEY);if(!raw)return {rules:[],auto:false,lastRun:'',snapshot:'none',snapshotAt:'21:00'};const s=JSON.parse(raw);if(!Array.isArray(s.rules)||s.rules.length>20||!s.rules.every(validRule)||new Set(s.rules.map(r=>r.id)).size!==s.rules.length||typeof s.auto!=='boolean'||typeof s.lastRun!=='string'||s.receipts!==undefined&&(!s.receipts||typeof s.receipts!=='object'||Array.isArray(s.receipts)||Object.keys(s.receipts).length>20||Object.values(s.receipts).some(v=>!validDate(v)))||s.snapshot!==undefined&&!['none','day','week','month'].includes(s.snapshot)||s.snapshotAt!==undefined&&!validTime(s.snapshotAt))throw Error('规则存储异常，保留原数据');return {snapshot:'none',snapshotAt:'21:00',...s}}
export function writeRules(storage,state){storage.setItem(RULE_KEY,JSON.stringify(state));return state}
export const newRule=()=>({id:id(),name:'新规则',list:'all',condition:'overdue',action:'tomorrow',enabled:true,trigger:'daily'});
const ordinary=t=>!t.deletedAt&&t.status==='pending'&&t.repeat==='none'&&!t.seriesId&&!t.previousId&&!t.seriesHold;
function condition(c,t,today,byId){switch(c){case 'overdue':return validDate(t.date)&&t.date<today;case 'unscheduled':return !t.date;case 'today':return t.date===today;case 'high':return t.priority===3;case 'doing':return t.stage==='doing';case 'todo':return t.stage==='todo';case 'unblocked':return !!t.dependsOn?.length&&t.dependsOn.every(i=>byId.get(i)?.status==='completed'&&!byId.get(i)?.deletedAt);default:return true}}
export function previewRules(data,rules,today,ids=null){
 if(!validDate(today))return [];
 const lists=new Set(data.lists.map(l=>l.id)),byId=new Map(data.tasks.map(t=>[t.id,t])),active=rules.filter(r=>validRule(r)&&r.enabled&&(r.list==='all'||lists.has(r.list)));
 const rows=[];
 for(const t of data.tasks){
  if(!ordinary(t)||ids&&!ids.has(t.id))continue;
  const matches=active.filter(r=>(r.list==='all'||r.list===t.listId)&&(!r.tag||t.tags.includes(r.tag))&&(()=>{const a=condition(r.condition,t,today,byId);return !r.extra?a:r.match==='any'?a||condition(r.extra,t,today,byId):a&&condition(r.extra,t,today,byId)})());
  const patch={},used=[];
  for(const r of matches){let next={};if(r.action==='high'||r.action==='low')next={priority:r.action==='high'?3:1};else if(r.action==='doing'||r.action==='todo')next={stage:r.action};else if(r.action==='clear-date')next={date:'',anchor:null};else if(r.action!=='closeout'||validDate(t.date)&&t.date<=today){const date=r.action==='today'?today:shiftDay(today,1);if(validDate(date))next={date,anchor:Number(date.slice(-2))}}
   const field=Object.keys(next)[0];if(field&&!Object.hasOwn(patch,field)&&t[field]!==next[field]){Object.assign(patch,next);used.push(r.name)}}
  if(used.length)rows.push({id:t.id,title:t.title,date:t.date,priority:t.priority,listId:t.listId,patch,rules:used});
 }
 return rows;
}
export function applyRules(data,rows,rules,today){
 if(!rows.length)return data;
 const current=new Map(previewRules(data,rules,today).map(r=>[r.id,r]));
 if(rows.some(r=>{const c=current.get(r.id);return !c||JSON.stringify(c)!==JSON.stringify(r)}))return data;
 const patches=new Map(rows.map(r=>[r.id,r.patch]));
 return {...data,tasks:data.tasks.map(t=>patches.has(t.id)?{...t,...patches.get(t.id)}:t)};
}
const fields=['date','anchor','priority','stage'];
export function validRun(r){return !!r&&typeof r.id==='string'&&typeof r.at==='string'&&Number.isFinite(Date.parse(r.at))&&['event','scheduled','manual'].includes(r.trigger)&&Array.isArray(r.changes)&&r.changes.length<=500&&new Set(r.changes.map(c=>c?.id)).size===r.changes.length&&r.changes.every(c=>c&&typeof c.id==='string'&&typeof c.title==='string'&&c.before&&c.after&&Object.keys(c.before).length>0&&Object.keys(c.before).every(k=>fields.includes(k)&&Object.hasOwn(c.after,k)&&validField(k,c.before[k])&&validField(k,c.after[k]))&&Object.keys(c.after).every(k=>Object.hasOwn(c.before,k)))}
function validField(k,v){return k==='date'?v===''||validDate(v):k==='anchor'?v===null||Number.isInteger(v)&&v>=1&&v<=31:k==='priority'?[0,1,2,3].includes(v):['todo','doing'].includes(v)}
export function recordRun(data,rows,rules,today,meta){
 if(!rows.length||rows.length>500)return data;
 const next=applyRules(data,rows,rules,today);if(next===data)return data;
 const byId=new Map(data.tasks.map(t=>[t.id,t]));
 const changes=rows.map(r=>({id:r.id,title:r.title,before:Object.fromEntries(Object.keys(r.patch).map(k=>[k,byId.get(r.id)[k]])),after:r.patch}));
 const run={...meta,changes};if(!validRun(run))return data;
 return {...next,workflowRuns:[run,...(data.workflowRuns||[])].slice(0,30)};
}
export function undoRun(data,runId){
 const run=(data.workflowRuns||[]).find(r=>r.id===runId);if(!validRun(run)||run.undone)return data;
 const byId=new Map(data.tasks.map(t=>[t.id,t]));
 if(run.changes.some(c=>{const t=byId.get(c.id);return !t||!ordinary(t)||Object.entries(c.after).some(([k,v])=>t[k]!==v)}))return data;
 const map=new Map(run.changes.map(c=>[c.id,c.before]));
 return {...data,tasks:data.tasks.map(t=>map.has(t.id)?{...t,...map.get(t.id)}:t),workflowRuns:data.workflowRuns.map(r=>r.id===runId?{...r,undone:true}:r)};
}
export function eventRules(before,after,rules,today,meta){
 if(before.tasks===after.tasks)return after;
 const old=new Map(before.tasks.map(t=>[t.id,t])),created=new Set(),changed=new Set(),completed=new Set();
 for(const t of after.tasks){const b=old.get(t.id);if(!b){created.add(t.id);continue}if(b.status==='pending'&&t.status==='completed'&&!t.deletedAt)completed.add(t.id);if(ordinary(t)&&['title','date','time','duration','priority','stage','listId','sectionId','tags','dependsOn'].some(k=>JSON.stringify(b[k])!==JSON.stringify(t[k])))changed.add(t.id)}
 const byId=new Map(after.tasks.map(t=>[t.id,t]));
 const dependents=new Set(after.tasks.filter(t=>ordinary(t)&&t.dependsOn?.some(i=>completed.has(i))&&t.dependsOn.every(i=>byId.get(i)?.status==='completed'&&!byId.get(i)?.deletedAt)).map(t=>t.id));
 const groups={created,changed,completed:dependents};let result=after;
 const buckets=new Map(),rows=[];
 for(const t of after.tasks){const selected=rules.filter(r=>groups[r.trigger]?.has(t.id));if(!selected.length)continue;const key=JSON.stringify(selected.map(r=>r.id));if(!buckets.has(key))buckets.set(key,{rules:selected,ids:new Set()});buckets.get(key).ids.add(t.id)}
 for(const bucket of buckets.values())rows.push(...previewRules(after,bucket.rules,today,bucket.ids));
 if(rows.length>500)return after;
 // Per-task triggered rules may differ; record directly from verified precomputed rows.
 if(rows.length){const changes=rows.map(r=>({id:r.id,title:r.title,before:Object.fromEntries(Object.keys(r.patch).map(k=>[k,byId.get(r.id)[k]])),after:r.patch}));const run={...meta,changes};if(validRun(run)){const patches=new Map(rows.map(r=>[r.id,r.patch]));result={...after,tasks:after.tasks.map(t=>patches.has(t.id)?{...t,...patches.get(t.id)}:t),workflowRuns:[run,...(after.workflowRuns||[])].slice(0,30)}}}
 return result;
}
export function dueScheduledRules(rules,now,receipts={}){
 const day=dayKey(now),time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
 return rules.filter(r=>validRule(r)&&r.enabled&&((r.trigger||'daily')==='daily'||r.trigger==='time'&&time>=r.at)&&receipts[r.id]!==day);
}
