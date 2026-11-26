import {validDate,shiftDay} from './domain.js';
import {blockMinutes} from './plan-block.js';
import {busyRanges,elapsedWindow,uniqueWallInstant,nearestFreeStart} from './time-intervals.js';
export {wallInstant,uniqueWallInstant} from './time-intervals.js';
import {calendarBusy,validPlanningWeek} from './productivity.js';
import {taskConflicts} from './advanced.js';
import {deadlineEnd} from './deadline.js';
export const WEEK_KEY='todo-weekly-hours-v1';
export const defaultWeek=()=>Array.from({length:7},(_,day)=>({day,enabled:day>0&&day<6,start:'09:00',end:'18:00'}));
export const validWeek=validPlanningWeek;
export function readWeek(storage){const raw=storage.getItem(WEEK_KEY);if(raw===null)return null;const rows=JSON.parse(raw);if(!validWeek(rows))throw Error('工作周配置损坏，原记录保留');return rows}
export function saveWeek(storage,rows){if(!validWeek(rows))throw Error('工作周时段无效');storage.setItem(WEEK_KEY,JSON.stringify(rows));return rows}
const minute=60000;
export function elapsedBudget(tasks,date,start,end){return elapsedWindow(busyRanges(tasks),date,start,end)}
export function previewWeekReflow(data,date,week,days=7,{notBefore=-Infinity}={}){
 if(!validDate(date)||!validWeek(week)||![3,7].includes(days))return [];
 const dates=Array.from({length:days},(_,i)=>shiftDay(date,i)).filter(validDate),daySet=new Set(dates);
 const all=[...data.tasks,...calendarBusy(data.calendarEvents)],conflicts=taskConflicts(all),related=new Set(data.tasks.filter(t=>!t.deletedAt).flatMap(t=>[t.parentId,...(t.dependsOn||[])].filter(Boolean)));
 let candidates=data.tasks.filter(t=>daySet.has(t.date)&&t.time&&t.stage!=='doing'&&t.id!==data.timer?.taskId&&t.status==='pending'&&!t.deletedAt&&!t.planLocked&&t.repeat==='none'&&!t.seriesId&&!t.previousId&&!t.seriesHold&&!t.planSegments?.length&&!t.parentId&&!t.dependsOn?.length&&!related.has(t.id)&&conflicts.has(t.id)).sort((a,b)=>b.priority-a.priority||a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.id.localeCompare(b.id)).slice(0,30);
 while(candidates.length){
  const moving=new Set(candidates.map(t=>t.id)),schedule=busyRanges(all.filter(t=>!moving.has(t.id))),rows=[];let rejected=null;
  for(const t of candidates){
   let chosen=null;const duration=blockMinutes(t),limit=deadlineEnd(t.deadline)??Infinity;
   for(const d of dates){if(d<t.date)continue;const hours=week[new Date(d+'T12:00:00').getDay()];if(!hours.enabled)continue;
    const budget=elapsedWindow(schedule,d,hours.start,hours.end);if(!budget)continue;
    const slot=nearestFreeStart(d,budget.free,duration,uniqueWallInstant(t.date,t.time)??+new Date(t.date+'T'+t.time),notBefore,limit);if(slot)chosen={date:d,time:slot.time};
    if(chosen)break;
   }
   if(!chosen){rejected=t.id;break}
   const a=uniqueWallInstant(chosen.date,chosen.time);schedule.push([a,a+duration*minute]);if(chosen.date!==t.date||chosen.time!==t.time)rows.push({id:t.id,title:t.title,fromDate:t.date,from:t.time,date:chosen.date,to:chosen.time,minutes:duration});
  }
  if(!rejected)return rows;candidates=candidates.filter(t=>t.id!==rejected);
 }
 return [];
}
export function applyWeekReflow(data,date,week,days,expected,options){const rows=previewWeekReflow(data,date,week,days,options);if(!rows.length||JSON.stringify(rows)!==JSON.stringify(expected))return data;const byId=new Map(rows.map(r=>[r.id,r]));return {...data,tasks:data.tasks.map(t=>{const r=byId.get(t.id);return r?{...t,date:r.date,time:r.to,anchor:Number(r.date.slice(-2))}:t})}}
