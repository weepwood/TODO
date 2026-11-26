import {blockMinutes} from './plan-block.js';
import {seriesSafetyKeys} from './series-control.js';
import {deadlineEnd} from './deadline.js';
import {taskFocusSeconds} from './pomodoro-planner.js';
import {nextSlot,blockers} from './advanced.js';
export function executionPlan(tasks,date,{start='09:00',end='18:00',max=30,sessions=[],includeBacklog=false,remainingBlocks=false}={}){
 if(!validWorkHours(start,end))return {placements:[],skipped:[],budget:null};
 let working=[...tasks],placements=[],skipped=[];const held=seriesSafetyKeys(tasks);
 const candidates=tasks.filter(t=>!t.external&&t.status==='pending'&&!t.deletedAt&&(!t.date||t.date===date||includeBacklog&&t.date<date)&&!t.time);
 const endDay=t=>deadlineEnd(t.deadline)??Infinity;
 candidates.sort((a,b)=>endDay(a)-endDay(b)||b.priority-a.priority||a.createdAt.localeCompare(b.createdAt));
 for(const task of candidates){
  const remaining=Math.max(0,task.duration*60-taskFocusSeconds(sessions,task.id));
  const skip=reason=>skipped.push({id:task.id,title:task.title,reason,remaining});
  if(task.planLocked){skip('时间块已锁定');continue}
  if(held.has(task.seriesId||task.id)||task.seriesHold||blockers(tasks,task).length){skip('等待前置任务或系列暂停');continue}
  if(task.repeat!=='none'&&task.date!==date||task.seriesId&&task.date!==date){skip('保留重复实例日期');continue}
  if(placements.length>=max){skip('达到单次安排上限');continue}
  // duration is both estimate and time-block length: never silently shrink it.
  const length=remainingBlocks?Math.ceil(remaining/60):task.duration;if(length<=0){skip('专注预算已达，等待任务确认');continue}
  const time=nextSlot(working,date,length,start,end);if(!time){skip('连续空闲时间不足');continue}
  const finish=new Date(date+'T'+time).getTime()+length*60000;
  const due=deadlineEnd(task.deadline),reason=due!==null&&finish>due?'预计超过截止期限':task.deadline?'按截止期限优先':'按优先级安排';
  const patch={id:task.id,date,time,anchor:Number(date.slice(-2)),...(remainingBlocks?{planMinutes:length}:{})};
  placements.push({...patch,reason,remaining});working=working.map(t=>t.id===task.id?{...t,...patch}:t)
 }
 return {placements,skipped,budget:workBudget(daySegments(working,date),start,end)};
}
export function planDay(tasks,date,options){return executionPlan(tasks,date,options).placements.map(({reason,remaining,...patch})=>patch)}
export function safeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}
export function taskActivity(task){const out=[{label:'创建任务',at:task.createdAt}];if(task.completedAt)out.push({label:'完成任务',at:task.completedAt});if(task.deletedAt)out.push({label:'移入回收站',at:task.deletedAt});if(task.previousId)out.push({label:'由上一重复实例生成',at:task.createdAt});return out.filter(e=>e.at).sort((a,b)=>b.at.localeCompare(a.at))}

export function calendarBusy(events=[]){
 return events.filter(e=>!e.allDay&&e.end&&Number.isFinite(Date.parse(e.start))&&Number.isFinite(Date.parse(e.end))&&Date.parse(e.end)>Date.parse(e.start)).map(e=>{
  const start=new Date(e.start),end=new Date(e.end),date=localDay(start);
  return {id:'external:'+e.id,title:e.title,external:true,date,time:start.toTimeString().slice(0,5),duration:Math.ceil((end-start+start.getSeconds()*1000+start.getMilliseconds())/60000),status:'pending',deletedAt:null};
 })
}
function localDay(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
export function daySegments(tasks,date){
 const start=new Date(date+'T00:00:00'),end=new Date(start);end.setDate(end.getDate()+1);
 return tasks.filter(t=>t.status==='pending'&&!t.deletedAt&&t.date&&t.time&&Number.isFinite(blockMinutes(t))&&blockMinutes(t)>0).flatMap(t=>{
  const a=new Date(t.date+'T'+t.time).getTime(),b=a+blockMinutes(t)*60000;
  if(!Number.isFinite(a)||b<=+start||a>=+end)return [];
  const left=Math.max(a,+start),right=Math.min(b,+end);
  return [{...t,duration:blockMinutes(t),time:new Date(left).toTimeString().slice(0,5),endTime:right===+end?'24:00':new Date(right).toTimeString().slice(0,5),segmentMinutes:Math.round((right-left)/60000),carryIn:a<+start,carryOut:b>+end}];
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
