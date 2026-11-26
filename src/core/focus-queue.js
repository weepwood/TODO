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
