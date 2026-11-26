import {blockInterval,busyRanges,elapsedWindow,representableStart} from './time-intervals.js';
import {shiftDay,validDate} from './domain.js';
import {blockMinutes,expandPlanBlocks} from './plan-block.js';
import {seriesSafetyKeys} from './series-control.js';
import {deadlineEnd} from './deadline.js';
import {focusSecondsByTask} from './pomodoro-planner.js';
import {blockers} from './advanced.js';
// Same candidate scope for the list, preview and commit.
export const planningCandidate=(t,date,includeBacklog=false)=>!t.external&&t.status==='pending'&&!t.deletedAt&&(!t.date||t.date===date||includeBacklog&&t.date<date)&&!t.time&&!t.planSegments?.length;
const MIN=60000;
export function validPlanningWeek(week){return Array.isArray(week)&&week.length===7&&week.every((r,i)=>r?.day===i&&typeof r.enabled==='boolean'&&validWorkHours(r.start,r.end))}
export function planningWindows(tasks,date,{start='09:00',end='18:00',splitDays=0,week=null,notBefore=null,reserve=0}={}){
 if(!validDate(date)||!validWorkHours(start,end)||week!==null&&!validPlanningWeek(week)||notBefore!==null&&!Number.isFinite(notBefore)||!Number.isInteger(reserve)||reserve<0||reserve>50||(!Number.isInteger(splitDays)||splitDays<0||splitDays>7))return [];
 const ranges=busyRanges(tasks),days=[];
 for(let i=0;i<Math.max(1,splitDays);i++){
  const d=shiftDay(date,i);if(!validDate(d))break;
  const h=week?week[new Date(d+'T12:00:00').getDay()]:{enabled:true,start,end};
  const b=h.enabled?elapsedWindow(ranges,d,h.start,h.end):null;
  const free=(b?.free||[]).map(([a,z])=>[Math.ceil(Math.max(a,notBefore??-Infinity)/MIN)*MIN,Math.floor(z/MIN)*MIN]).filter(([a,z])=>z>a);
  const usable=free.reduce((s,[a,z])=>s+(z-a)/MIN,0),limit=Math.floor(usable*(100-reserve)/100);
  days.push({date:d,enabled:h.enabled,capacity:b?.capacity??0,occupied:b?.occupied??0,usable,reserved:usable-limit,limit,free});
 }
 return days;
}
function fit(days,task,length,due,splitDays,preferFit=false){
 const usable=days.filter((d,i)=>i===0||splitDays&&task.repeat==='none'&&!task.seriesId);
 const ranges=usable.flatMap(d=>d.free.map(([a,b])=>({d,a,b:Math.min(b,due)})).filter(r=>r.b-r.a>=MIN));
 // Retain a contiguous first-day plan where possible; split only if needed.
 const firstDay=ranges.filter(r=>r.d===days[0]);if(preferFit)firstDay.sort((x,y)=>(x.b-x.a)-(y.b-y.a)||x.a-y.a);
 for(const {d,a,b} of firstDay){
  if(d.limit<length)continue;
  const slot=representableStart(d.date,a,b,length);if(slot)return [{d,instant:slot.instant,time:slot.time,minutes:length}];
 }
 if(!splitDays)return null;
 let left=length;const parts=[],used=new Map();
 for(const {d,a,b} of ranges){
  const slot=representableStart(d.date,a,b);if(!slot)continue;
  const minutes=Math.min(left,d.limit-(used.get(d.date)||0),Math.floor((b-slot.instant)/MIN));if(minutes<1)continue;
  parts.push({d,instant:slot.instant,time:slot.time,minutes});used.set(d.date,(used.get(d.date)||0)+minutes);left-=minutes;
  if(!left)return parts;if(parts.length>=31)break;
 }
 return null;
}
function consume(parts){
 for(const {d,instant,minutes} of parts){
  const finish=instant+minutes*MIN;d.limit-=minutes;
  d.free=d.free.flatMap(([a,b])=>instant>=b||finish<=a?[[a,b]]:[[a,instant],[finish,b]].filter(([x,y])=>y>x));
 }
}
function availableBefore(days,due){return days.reduce((s,d)=>s+Math.min(d.limit,d.free.reduce((n,[a,b])=>n+Math.max(0,Math.floor((Math.min(b,due)-a)/MIN)),0)),0)}
export function executionPlan(tasks,date,{start='09:00',end='18:00',max=30,sessions=[],includeBacklog=false,remainingBlocks=false,splitDays=0,week=null,notBefore=null,reserve=0,optimize=true,activeTaskId=null}={}){
 const windows=planningWindows(tasks,date,{start,end,splitDays,week,notBefore,reserve});
 if(!windows.length)return {placements:[],skipped:[],budget:null,capacity:[],optimization:{trials:0}};
 const held=seriesSafetyKeys(tasks),byId=new Map(tasks.map(t=>[t.id,t])),focus=focusSecondsByTask(sessions);
 const remaining=t=>Math.max(0,t.duration*60-(focus.get(t.id)||0));
 const length=t=>remainingBlocks?Math.ceil(remaining(t)/60):Math.ceil(t.duration);
 const due=t=>deadlineEnd(t.deadline)??Infinity;
 const candidates=tasks.filter(t=>planningCandidate(t,date,includeBacklog)).sort((a,b)=>due(a)-due(b)||b.priority-a.priority||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
 const skipped=[],eligible=[];
 for(const t of candidates){
  const direct=blockers(tasks,t),reason=t.id===activeTaskId||t.stage==='doing'?'任务正在执行':t.planLocked?'时间块已锁定':held.has(t.seriesId||t.id)||t.seriesHold?'系列暂停或存在冲突':direct.length?'等待前置任务':(t.repeat!=='none'||t.seriesId)&&t.date!==date?'保留重复实例日期':length(t)<=0?'专注预算已达，等待任务确认':null;
  if(reason){
   // Unique unfinished ancestors: an estimate, not a proven feasibility bound.
   const seen=new Set([t.id]),stack=direct.slice();let prerequisiteMinutes=0;
   while(stack.length){const p=stack.pop();if(seen.has(p.id))continue;seen.add(p.id);prerequisiteMinutes+=Math.ceil(remaining(p)/60);for(const id of p.dependsOn||[]){const a=byId.get(id);if(a&&!a.deletedAt&&a.status!=='completed')stack.push(a)}}
   const available=availableBefore(windows.filter((_,i)=>i===0||splitDays&&t.repeat==='none'&&!t.seriesId),due(t));
   skipped.push({id:t.id,title:t.title,reason,remaining:remaining(t),...(direct.length?{blockingCount:seen.size-1,prerequisiteMinutes,availableMinutes:available,gapMinutes:Math.max(0,length(t)-available)}: {})});
  }else eligible.push(t);
 }
 function run(order,preferFit=false){
  const days=windows.map(d=>({...d,free:d.free.map(r=>r.slice())})),placements=[],missing=[];
  for(const t of order){
   const len=length(t),deadline=due(t),allowed=days.filter((_,i)=>i===0||splitDays&&t.repeat==='none'&&!t.seriesId),available=availableBefore(allowed,deadline);
   let reason=placements.length>=max?'达到单次安排上限':null;
   const parts=reason?null:fit(days,t,len,deadline,splitDays,preferFit);
   if(!parts){
    if(!reason)reason=deadline!==Infinity&&available<len?'截止期限前容量不足':available<len?'所选日期范围容量不足':'连续空闲时间不足';
    missing.push({id:t.id,title:t.title,reason,remaining:remaining(t),availableMinutes:available,gapMinutes:Math.max(0,len-available)});continue;
   }
   const [first,...tail]=parts;consume(parts);
   placements.push({id:t.id,date:first.d.date,time:first.time,anchor:Number(first.d.date.slice(-2)),...(remainingBlocks||tail.length||t.planMinutes!=null||first.minutes!==t.duration?{planMinutes:first.minutes}:{}),...(tail.length?{planSegments:tail.map((p,i)=>({id:'auto-'+(i+1),date:p.d.date,time:p.time,minutes:p.minutes}))}:{}),reason:t.deadline?'按截止期限安排':'按优先级安排',remaining:remaining(t)});
  }
  return {placements,missing,days};
 }
 const base=run(eligible);let best=base,trials=0;
 const protectedIds=new Set(base.placements.map(p=>p.id));
 const segments=r=>r.placements.reduce((n,p)=>n+1+(p.planSegments?.length||0),0);
 const score=r=>[r.placements.length,r.placements.reduce((s,p)=>s+(byId.get(p.id)?.priority||0),0),-segments(r),-r.days.reduce((n,d)=>n+d.free.length,0)];
 const better=(a,b)=>{const x=score(a),y=score(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]>y[i];return false};
 // Limited insertion repair. No baseline task may be dropped; never claim global optimality.
 if(optimize&&eligible.length<=60&&base.missing.length&&base.placements.length<max){
  for(const miss of base.missing.slice(0,6)){
   const idx=eligible.findIndex(t=>t.id===miss.id);
   for(const pos of [...new Set([0,Math.max(0,idx-1),Math.max(0,idx-2),Math.floor(idx/2)])]){
    if(pos>=idx||trials>=24)continue;
    const order=eligible.slice();order.splice(pos,0,order.splice(idx,1)[0]);const r=run(order);trials++;
    const ids=new Set(r.placements.map(p=>p.id));if([...protectedIds].every(id=>ids.has(id))&&better(r,best))best=r;
   }
  }
  if(trials<24){
   const r=run(eligible,true);trials++;const ids=new Set(r.placements.map(p=>p.id));
   if([...protectedIds].every(id=>ids.has(id))&&better(r,best))best=r;
  }
 }
 const {placements,missing,days}=best,working=tasks.map(t=>({...t,...placements.find(p=>p.id===t.id)}));
 return {placements,skipped:[...skipped,...missing],budget:!windows[0].enabled?null:workBudget(daySegments(working,date),week?week[new Date(date+'T12:00:00').getDay()].start:start,week?week[new Date(date+'T12:00:00').getDay()].end:end),capacity:windows.map((w,i)=>({date:w.date,enabled:w.enabled,capacity:w.capacity,occupied:w.occupied,usable:w.usable,reserved:w.reserved,planned:w.limit-days[i].limit,remaining:days[i].limit})),optimization:{trials,baseline:base.placements.length}};
}
export function planDay(tasks,date,options){return executionPlan(tasks,date,options).placements.map(({reason,remaining,...patch})=>patch)}
export function safeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}
export function taskActivity(task){const out=[{label:'创建任务',at:task.createdAt}];if(task.completedAt)out.push({label:'完成任务',at:task.completedAt});if(task.deletedAt)out.push({label:'移入回收站',at:task.deletedAt});if(task.previousId)out.push({label:'由上一重复实例生成',at:task.createdAt});return out.filter(e=>e.at).sort((a,b)=>b.at.localeCompare(a.at))}

export function calendarBusy(events=[]){
 return events.filter(e=>!e.allDay&&e.end&&Number.isFinite(Date.parse(e.start))&&Number.isFinite(Date.parse(e.end))&&Date.parse(e.end)>Date.parse(e.start)).map(e=>{
  const start=new Date(e.start),end=new Date(e.end),date=localDay(start);
  return {id:'external:'+e.id,title:e.title,external:true,date,time:start.toTimeString().slice(0,5),duration:Math.ceil((end-start+start.getSeconds()*1000+start.getMilliseconds())/60000),startInstant:+start,endInstant:+end,status:'pending',deletedAt:null};
 })
}
function localDay(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
export function daySegments(tasks,date){
 const start=new Date(date+'T00:00:00'),end=new Date(start);end.setDate(end.getDate()+1);
 return expandPlanBlocks(tasks).filter(t=>t.status==='pending'&&!t.deletedAt&&t.date&&t.time&&Number.isFinite(blockMinutes(t))&&blockMinutes(t)>0).flatMap(t=>{
  const [a,b]=blockInterval(t);
  if(!Number.isFinite(a)||b<=+start||a>=+end)return [];
  const left=Math.max(a,+start),right=Math.min(b,+end);
  return [{...t,planSegments:[],duration:blockMinutes(t),time:new Date(left).toTimeString().slice(0,5),endTime:right===+end?'24:00':new Date(right).toTimeString().slice(0,5),segmentMinutes:Math.round((right-left)/60000),carryIn:a<+start,carryOut:b>+end}];
 }).sort((a,b)=>a.time.localeCompare(b.time));
}
export function validWorkHours(start,end){return /^([01]\d|2[0-3]):[0-5]\d$/.test(start)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(end)&&start<end}

// Wall-clock planning budget: merge overlaps before calculating occupied time.
export function workBudget(segments,start,end){
 if(!validWorkHours(start,end))return null;
 const minute=s=>s.split(':').reduce((n,v)=>n*60+Number(v),0);
 const lo=minute(start),hi=minute(end),ranges=segments.filter(t=>/^\d{2}:\d{2}$/.test(t.time)&&/^\d{2}:\d{2}$/.test(t.endTime)).map(t=>[Math.max(lo,minute(t.time)),Math.min(hi,minute(t.endTime))]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
 const merged=[];for(const [a,b] of ranges){const last=merged.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else merged.push([a,b])}
 const occupied=merged.reduce((n,[a,b])=>n+b-a,0),free=[];let cursor=lo;for(const [a,b] of merged){if(a>cursor)free.push([cursor,a]);cursor=b}if(cursor<hi)free.push([cursor,hi]);
 return {capacity:hi-lo,occupied,remaining:hi-lo-occupied,free};
}

export const PLANNER_PREFS_KEY='todo-planner-preferences-v1';
export function normalizePlannerPreferences(value){
 const start=value?.workStart,end=value?.workEnd;
 return {workStart:validWorkHours(start,end)?start:'09:00',workEnd:validWorkHours(start,end)?end:'18:00',allHours:value?.allHours===true,visual:value?.visual!==false,hourHeight:[56,80,112].includes(value?.hourHeight)?value.hourHeight:56};
}
export function readPlannerPreferences(storage){try{return normalizePlannerPreferences(JSON.parse(storage?.getItem(PLANNER_PREFS_KEY)||'{}'))}catch{return normalizePlannerPreferences({})}}
