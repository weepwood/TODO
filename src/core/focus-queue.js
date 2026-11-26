import {seriesSafetyKeys} from './series-control.js';
import {validDate} from './domain.js';
import {pomodoroPlan,taskFocusSeconds} from './pomodoro-planner.js';
import {blockers} from './advanced.js';
export const FOCUS_QUEUE_KEY='todo-focus-queue-v1';
export function normalizeQueue(value,date){
 if(!validDate(date)||value?.date!==date||!Array.isArray(value.items))return {date,items:[]};
 const seen=new Set();
 return {date,items:value.items.filter(i=>typeof i?.id==='string'&&i.id.length<=512&&i.id&&!seen.has(i.id)&&seen.add(i.id)).slice(0,100).map(i=>({id:i.id,skipped:i.skipped===true}))};
}
export function readFocusQueue(storage,date){
 const raw=storage?.getItem(FOCUS_QUEUE_KEY);
 if(!raw)return {date,items:[]};
 return normalizeQueue(JSON.parse(raw),date);
}
export function queueItems(queue,data){
 const tasks=new Map(data.tasks.map(t=>[t.id,t])),held=seriesSafetyKeys(data.tasks);
 return queue.items.map(item=>{
  const task=tasks.get(item.id),eligible=task?.status==='pending'&&!task.deletedAt&&!task.seriesHold&&!held.has(task.seriesId||task.id)&&!blockers(data.tasks,task).length;
  const actual=taskFocusSeconds(data.sessions,item.id),budget=Math.max(0,(task?.duration||0)*60);
  const plan=task?pomodoroPlan(task,data.sessions,data.focusConfig):null;
  const done=actual>=budget&&budget>0;
  return {...item,task,actual,budget,plan,done,eligible:!!eligible&&!item.skipped&&!done,active:data.timer?.taskId===item.id};
 });
}
export function moveQueue(queue,id,delta){
 const i=queue.items.findIndex(x=>x.id===id),to=i+delta;if(i<0||to<0||to>=queue.items.length)return queue;
 const items=queue.items.slice();items.splice(to,0,items.splice(i,1)[0]);return {...queue,items};
}

// Explicit carry-over, never silently restart yesterday's queue.
export function previousQueue(storage,date){
 const raw=storage?.getItem(FOCUS_QUEUE_KEY);if(!raw)return null;
 const q=JSON.parse(raw);return validDate(q?.date)&&q.date<date?normalizeQueue(q,q.date):null;
}
export function carryQueue(queue,data,date){
 return {date,items:queueItems(queue,data).filter(i=>i.eligible).map(i=>({id:i.id,skipped:false}))};
}
export function validQueueRun(run){
 return !!run&&typeof run.id==='string'&&run.id.length<=100&&Number.isInteger(run.goal)&&run.goal>=60&&run.goal<=86400&&Array.isArray(run.items)&&run.items.length>0&&run.items.length<=100&&new Set(run.items.map(i=>i?.id)).size===run.items.length&&run.items.every(i=>i&&typeof i.id==='string'&&i.id.length<=512&&Number.isInteger(i.baseline)&&i.baseline>=0&&Number.isInteger(i.target)&&i.target>=60&&i.target<=86400);
}
export function makeQueueRun(queue,data,goal,id){
 const items=queueItems(queue,data).filter(i=>i.eligible&&i.budget-i.actual>=60).map(i=>({id:i.id,baseline:i.actual,target:Math.floor(i.budget-i.actual)}));
 const run={id,goal,items};return validQueueRun(run)?run:null;
}
export function queueRunProgress(run,data){
 if(!validQueueRun(run))return {actual:0,remaining:0,next:null};
 const rows=run.items.map(i=>{const actual=Math.max(0,taskFocusSeconds(data.sessions,i.id)-i.baseline);return {...i,actual,remaining:Math.max(0,i.target-actual)}});
 const actual=rows.reduce((n,i)=>n+Math.min(i.actual,i.target),0),remaining=Math.max(0,run.goal-actual);
 const held=seriesSafetyKeys(data.tasks),next=rows.find(i=>{
  const t=data.tasks.find(t=>t.id===i.id);return i.remaining>=60&&t?.status==='pending'&&!t.deletedAt&&!held.has(t.seriesId||t.id)&&!blockers(data.tasks,t).length;
 });
 return {actual,remaining,next:remaining>=60&&next?{...next,remaining:Math.min(next.remaining,remaining)}:null};
}
