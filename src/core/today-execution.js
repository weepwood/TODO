import {closeoutPreview,applyCloseout} from './task-lifecycle.js';
import {deadlineEnd,deadlineStatus} from './deadline.js';
import {seriesSafetyKeys} from './series-control.js';
import {focusSecondsByTask} from './pomodoro-planner.js';
export function todayExecution(data,today,now=new Date()){
 const held=seriesSafetyKeys(data.tasks),focus=focusSecondsByTask(data.sessions),byId=new Map(data.tasks.map(t=>[t.id,t]));
 const items=data.tasks.filter(t=>t.status==='pending'&&!t.deletedAt&&(t.date&&t.date<=today||t.planSegments?.some(s=>s.date===today)||t.deadline&&t.deadline.slice(0,10)<=today)).map(task=>({
  task,blocked:held.has(task.seriesId||task.id)||(task.dependsOn||[]).some(id=>{const t=byId.get(id);return t&&!t.deletedAt&&t.status!=='completed'}),
  risk:deadlineStatus(task,now),backlog:!!task.date&&task.date<today,remaining:Math.max(0,task.duration*60-(focus.get(task.id)||0))
 }));
 items.sort((a,b)=>Number(a.blocked)-Number(b.blocked)||((deadlineEnd(a.task.deadline)??Infinity)-(deadlineEnd(b.task.deadline)??Infinity))||b.task.priority-a.task.priority||(a.task.time||'99:99').localeCompare(b.task.time||'99:99')||a.task.id.localeCompare(b.task.id));
 return {items,next:items.find(i=>!i.blocked),risk:items.filter(i=>['today','overdue'].includes(i.risk)).length,backlog:items.filter(i=>i.backlog).length};
}

export function backlogPreview(data,today,ids){
 const wanted=new Set(ids);
 return closeoutPreview(data.tasks.filter(t=>t.date<today&&!t.planSegments?.length),[...wanted],today);
}
export function postponeBacklog(data,today,rows){
 const current=backlogPreview(data,today,rows.map(r=>r.id));
 if(JSON.stringify(current)!==JSON.stringify(rows))return data;
 const tasks=applyCloseout(data.tasks,rows,today);
 return tasks===data.tasks?data:{...data,tasks};
}
