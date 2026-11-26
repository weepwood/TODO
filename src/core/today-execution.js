import {deadlineEnd,deadlineStatus} from './deadline.js';
import {blockers} from './advanced.js';
import {seriesSafetyKeys} from './series-control.js';
import {taskFocusSeconds} from './pomodoro-planner.js';
export function todayExecution(data,today,now=new Date()){
 const held=seriesSafetyKeys(data.tasks);
 const items=data.tasks.filter(t=>t.status==='pending'&&!t.deletedAt&&(t.date&&t.date<=today||t.deadline&&t.deadline.slice(0,10)<=today)).map(task=>({
  task,blocked:held.has(task.seriesId||task.id)||blockers(data.tasks,task).length>0,
  risk:deadlineStatus(task,now),backlog:!!task.date&&task.date<today,remaining:Math.max(0,task.duration*60-taskFocusSeconds(data.sessions,task.id))
 }));
 items.sort((a,b)=>Number(a.blocked)-Number(b.blocked)||((deadlineEnd(a.task.deadline)??Infinity)-(deadlineEnd(b.task.deadline)??Infinity))||b.task.priority-a.task.priority||(a.task.time||'99:99').localeCompare(b.task.time||'99:99')||a.task.id.localeCompare(b.task.id));
 return {items,next:items.find(i=>!i.blocked),risk:items.filter(i=>['today','overdue'].includes(i.risk)).length,backlog:items.filter(i=>i.backlog).length};
}
