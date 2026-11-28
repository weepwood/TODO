// Local-only user rules. No report, raw activity, or task edits are persisted.
import {activityColor,unionIntervals,activityTaskComparison,activityPeriod,shiftActivityPeriod} from './activitywatch-summary.js';
export const activityRulesKey=scope=>'todo-activity-rules-v1:'+encodeURIComponent(scope||'guest');
const base=[['development','开发'],['learning','学习'],['communication','沟通'],['entertainment','娱乐']];
export const defaultActivityRules=()=>({categories:base.map(([id,name])=>({id,name})),mappings:[]});
const validText=(v,n)=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
export function validateActivityRules(r){
 if(!r||!Array.isArray(r.categories)||r.categories.length>24||!Array.isArray(r.mappings)||r.mappings.length>500)return false;
 const ids=new Set(),names=new Set(),keys=new Set();
 for(const c of r.categories){
  if(!validText(c?.id,80)||c.id==='other'||!validText(c.name,32)||c.name==='未分类'||ids.has(c.id)||names.has(c.name))return false;
  ids.add(c.id);names.add(c.name);
 }
 for(const m of r.mappings){
  if(!['apps','websites'].includes(m?.kind)||!validText(m.subject,253)||/[/?#\\]/.test(m.subject)||m.kind==='websites'&&!/^[a-z0-9.-]+$/.test(m.subject))return false;
  if(m.category!==null&&!ids.has(m.category)||m.taskId!==null&&!validText(m.taskId,200)||m.category===null&&m.taskId===null)return false;
  const key=JSON.stringify([m.kind,m.subject]);if(keys.has(key))return false;keys.add(key);
 }
 return true;
}
export function readActivityRules(storage,scope){
 try{const raw=storage.getItem(activityRulesKey(scope));if(raw===null)return {rules:defaultActivityRules(),error:''};const r=JSON.parse(raw);if(validateActivityRules(r))return {rules:r,error:''};}
 catch{}
 return {rules:defaultActivityRules(),error:'本地分类配置无法读取；保留原配置，不会自动覆盖。'};
}
export function saveActivityRules(storage,scope,r){
 if(!validateActivityRules(r))throw Error('分类或映射不合法，或超出数量限制');
 // Only normalized, explicitly selected configuration fields. Never persist report.
 const safe={categories:r.categories.map(({id,name})=>({id,name})),mappings:r.mappings.map(({kind,subject,category,taskId})=>({kind,subject,category,taskId}))};
 storage.setItem(activityRulesKey(scope),JSON.stringify(safe));
 return safe;
}
export function setActivityMapping(r,m){
 const next={...r,mappings:r.mappings.filter(x=>x.kind!==m.kind||x.subject!==m.subject)};
 if(m.category!==null||m.taskId!==null)next.mappings.push(m);
 if(!validateActivityRules(next))throw Error('分类或映射不合法，或超出数量限制');return next;
}
export function removeActivityCategory(r,id){
 return {...r,categories:r.categories.filter(c=>c.id!==id),mappings:r.mappings.map(m=>m.category===id?{...m,category:null}:m).filter(m=>m.category!==null||m.taskId!==null)};
}
export const exampleActivityRules=()=>({...defaultActivityRules(),mappings:[
 {kind:'apps',subject:'VS Code',category:'development',taskId:'demo-1'},
 {kind:'apps',subject:'Obsidian',category:'learning',taskId:'demo-2'},
 {kind:'websites',subject:'github.com',category:'development',taskId:'demo-1'},
 {kind:'websites',subject:'developer.mozilla.org',category:'learning',taskId:null}
]});
const localKey=t=>{const d=new Date(t);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
export function categoryTrend(report,rules,mode,kind){
 const categories=[...rules.categories,{id:'other',name:'未分类'}].map(c=>({...c,color:c.id==='other'?'#9299a4':activityColor(c.id)}));
 const mapping=new Map(rules.mappings.filter(m=>m.kind===kind).map(m=>[m.subject,m.category]));
 const grouped=new Map();
 for(const d of report.days){
  const key=mode==='year'?localKey(d.start).slice(0,7):localKey(d.start);
  const row=grouped.get(key)||{key,range:0,known:0,available:false,missing:0,values:new Map()};
  const available=kind==='apps'?d.known_ms>0:d.website_available;
  row.range+=d.end-d.start;row.known+=d.known_ms;row.available||=available;row.missing+=available?0:1;
  for(const s of d[kind]){const id=mapping.get(s.subject)||'other';row.values.set(id,(row.values.get(id)||0)+s.ms)}
  grouped.set(key,row);
 }
 const rows=[...grouped.values()].map(r=>({...r,segments:categories.map(c=>({...c,ms:r.values.get(c.id)||0})),total:[...r.values.values()].reduce((a,b)=>a+b,0)}));
 const totals=categories.map(c=>({...c,ms:rows.reduce((n,r)=>n+(r.values.get(c.id)||0),0)}));
 return {rows,totals};
}
export function activityPatterns(report,kind){
 const days=report.days.map(d=>({key:localKey(d.start),ms:kind==='apps'?d.active_ms:d.website_ms,known:d.known_ms,range:d.end-d.start,available:kind==='apps'?d.known_ms>0:d.website_available,weekday:new Date(d.start).getDay()}));
 const weekdays=Array.from({length:7},(_,i)=>({weekday:(i+1)%7,total:0,count:0,missing:0}));
 for(const d of days){const w=weekdays.find(w=>w.weekday===d.weekday);if(d.available){w.total+=d.ms;w.count++}else w.missing++}
 return {days,weekdays:weekdays.map(w=>({...w,average:w.count?w.total/w.count:null}))};
}
// Fixed elapsed-hour slices from local midnight. Repeated DST wall hours retain
// distinct intervals, fractional offset transitions are not silently collapsed.
export function activityHourly(report,kind){
 if(report.days.length!==1)return [];
 const spans=kind==='apps'?report.timeline:report.website_timeline,rows=[];
 for(let a=report.start;a<report.end;a+=3600000){
  const b=Math.min(a+3600000,report.end),ms=spans.reduce((n,s)=>n+Math.max(0,Math.min(b,s.end)-Math.max(a,s.start)),0);
  rows.push({start:a,end:b,ms});
 }
 return rows;
}
const total=rows=>rows.reduce((n,[a,b])=>n+b-a,0);
export function activityTaskReview(data,report,day,rules){
 const base=activityTaskComparison(data,report,day),byId=new Map(base.map(t=>[t.id,t]));
 const bySubject=new Map(rules.mappings.filter(m=>m.taskId).map(m=>[JSON.stringify([m.kind,m.subject]),m.taskId]));
 const byTask=new Map(),configured=new Set(bySubject.values());
 for(const kind of ['apps','websites'])for(const s of kind==='apps'?report.timeline:report.website_timeline||[]){
  const id=bySubject.get(JSON.stringify([kind,s.subject]));if(!id)continue;
  const a=Math.max(report.start,s.start),b=Math.min(report.end,s.end);if(b<=a)continue;
  if(!byTask.has(id))byTask.set(id,[]);byTask.get(id).push([a,b]);
 }
 const result=[];
 for(const task of data.tasks.filter(t=>!t.deletedAt)){
  const b=byId.get(task.id),matched=total(unionIntervals(byTask.get(task.id)||[]));
  if(!b&&!matched)continue;
  const row=b||{id:task.id,title:task.title,estimate:Math.max(0,Number(task.duration)||0)*60000,focus:0,plan:0,focusOverlap:0,planOverlap:0};
  result.push({...row,configured:configured.has(task.id),matched,focusPlanDelta:row.plan>0&&row.focus>0?row.focus-row.plan:null,matchedPlanDelta:row.plan>0&&matched>0?matched-row.plan:null});
 }
 return result;
}
export function previousActivityPeriod(day,mode,now=Date.now()){
 const previous=shiftActivityPeriod(day,mode,-1);
 return activityPeriod(previous,mode,now);
}
export function periodComparison(current,previous,kind){
 const one=r=>({ms:kind==='apps'?r.active_ms:r.website_ms,available:kind==='apps'?r.known_ms>0:r.website_available,coverage:r.known_ms/(r.end-r.start),range:r.end-r.start});
 const a=one(current),b=one(previous);
 return {current:a,previous:b,observedDelta:a.available&&b.available?a.ms-b.ms:null,delta:a.available&&b.available&&a.range===b.range&&a.coverage===1&&b.coverage===1&&kind==='apps'?a.ms-b.ms:null};
}
