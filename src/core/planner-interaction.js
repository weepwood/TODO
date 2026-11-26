import {blockInterval,uniqueWallInstant,busyRanges,elapsedWindow,nearestFreeStart} from './time-intervals.js';
import {expandPlanBlocks,blockMinutes} from './plan-block.js';
import {taskConflicts} from './advanced.js';
import {deadlineEnd} from './deadline.js';
import {validDate,validTime,shiftDay} from './domain.js';
import {validWorkHours,calendarBusy,planningWindows} from './productivity.js';
// Use elapsed minutes, exactly as persisted calendar events do. Half-open
// intervals include the entire continuation on the following day.
export function projectBlock(tasks,renderId,date,time,minutes){
 if(!validDate(date)||!validTime(time)||!Number.isInteger(minutes)||minutes<1||minutes>1440)return null;
 const start=uniqueWallInstant(date,time);if(start===null)return null;const end=start+minutes*60000;
 const blocks=expandPlanBlocks(tasks).filter(t=>t.status==='pending'&&!t.deletedAt&&t.date&&t.time&&t.id!==renderId);
 const overlaps=blocks.filter(t=>{const [a,b]=blockInterval(t);return Number.isFinite(a)&&start<b&&a<end}).map(t=>t.id);
 const projected=[...blocks.map(t=>({...t,planSegments:[]})),{id:renderId,date,time,duration:minutes,planMinutes:minutes,status:'pending',planSegments:[]}];
 const dates=[date],last=new Date(end-1),lastDay=last.getFullYear()+'-'+String(last.getMonth()+1).padStart(2,'0')+'-'+String(last.getDate()).padStart(2,'0');
 for(let d=shiftDay(date,1);validDate(d)&&d<=lastDay&&dates.length<4;d=shiftDay(d,1))dates.push(d);
 return {overlaps,projected,dates};
}
export function projectedCapacity(tasks,renderId,date,time,minutes,start,end){
 const p=projectBlock(tasks,renderId,date,time,minutes);if(!p||!validWorkHours(start,end))return null;
 const ranges=busyRanges(p.projected);return {overlaps:p.overlaps,days:p.dates.map(date=>({date,...(elapsedWindow(ranges,date,start,end)||{remaining:null})}))};
}
export const WORK_HOURS_KEY='todo-work-hours-presets-v1';
export function readWorkHours(storage){
 const raw=storage.getItem(WORK_HOURS_KEY);if(raw===null)return [];
 const rows=JSON.parse(raw);
 if(!Array.isArray(rows)||rows.length>20||new Set(rows.map(r=>r.name)).size!==rows.length||!rows.every(r=>typeof r.name==='string'&&r.name.trim()&&r.name.length<=40&&validWorkHours(r.start,r.end)))throw Error('工作时段模板损坏，原数据保留');
 return rows;
}
export function saveWorkHours(storage,name,start,end){
 name=name.trim();if(!name||name.length>40||!validWorkHours(start,end))throw Error('模板名称或时段无效');
 const rows=readWorkHours(storage);if(rows.some(r=>r.name===name))throw Error('模板名称已存在');if(rows.length>=20)throw Error('最多20份模板');
 const next=[...rows,{name,start,end}];storage.setItem(WORK_HOURS_KEY,JSON.stringify(next));return next;
}
export function deleteWorkHours(storage,name){const next=readWorkHours(storage).filter(r=>r.name!==name);storage.setItem(WORK_HOURS_KEY,JSON.stringify(next));return next}

// Conservative reflow: only simple movable tasks on the selected day that
// overlap another block. Keep locked, recurring, related and multi-block work fixed.
export function previewReflow(data,date,start,end,{notBefore=null,week=null}={}){
 if(!validDate(date)||!validWorkHours(start,end))return [];
 const busy=calendarBusy(data.calendarEvents),all=[...data.tasks,...busy],conflicts=taskConflicts(all);
 const related=new Set(data.tasks.filter(t=>!t.deletedAt).flatMap(t=>[t.parentId,...(t.dependsOn||[])].filter(Boolean)));
 const movable=data.tasks.filter(t=>t.status==='pending'&&!t.deletedAt&&!t.planLocked&&t.date===date&&t.time&&t.stage!=='doing'&&t.id!==data.timer?.taskId&&t.repeat==='none'&&!t.seriesId&&!t.seriesHold&&!t.previousId&&!t.planSegments?.length&&!t.parentId&&!t.dependsOn?.length&&!related.has(t.id)&&conflicts.has(t.id)).sort((a,b)=>b.priority-a.priority||a.time.localeCompare(b.time)||a.id.localeCompare(b.id)).slice(0,30);
 const rows=[];
 // If one task cannot be fitted, keep its original block and restart. This
 // avoids proposing a move into the original slot of a task that cannot move.
 let candidates=movable.slice();
 while(candidates.length){
  const ids=new Set(candidates.map(t=>t.id)),schedule=all.filter(t=>!ids.has(t.id));let rejected=null;rows.length=0;
  for(const t of candidates){
   const deadline=deadlineEnd(t.deadline)??Infinity;
   const w=planningWindows(schedule,date,{start,end,week,notBefore})[0];
   const target=blockInterval(t)[0],slot=w&&nearestFreeStart(date,w.free,blockMinutes(t),target,notBefore??-Infinity,deadline);
   const time=slot?.time;if(!time){rejected=t.id;break}
   schedule.push({...t,time});if(time!==t.time)rows.push({id:t.id,title:t.title,from:t.time,to:time,minutes:blockMinutes(t)});
  }
  if(!rejected)return rows.slice();
  candidates=candidates.filter(t=>t.id!==rejected);
 }
 return [];
}
export function applyReflow(data,date,start,end,expected,options){
 const current=previewReflow(data,date,start,end,options);if(!current.length||JSON.stringify(current)!==JSON.stringify(expected))return data;
 const byId=new Map(current.map(r=>[r.id,r]));return {...data,tasks:data.tasks.map(t=>byId.has(t.id)?{...t,time:byId.get(t.id).to}:t)};
}
