import {nextSlot,blockers} from './advanced.js';
export function planDay(tasks,date,{start='09:00',end='18:00',max=30}={}){
 let working=[...tasks],placements=[];
 const candidates=tasks.filter(t=>t.status==='pending'&&!t.deletedAt&&(!t.date||t.date===date)&&!t.time&&!blockers(tasks,t).length).sort((a,b)=>b.priority-a.priority||a.createdAt.localeCompare(b.createdAt)).slice(0,max);
 for(const task of candidates){const time=nextSlot(working,date,task.duration,start,end);if(!time)continue;const patch={id:task.id,date,time,anchor:Number(date.slice(-2))};placements.push(patch);working=working.map(t=>t.id===task.id?{...t,...patch}:t)}
 return placements;
}
export function safeLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}catch{return null}}
export function taskActivity(task){const out=[{label:'创建任务',at:task.createdAt}];if(task.completedAt)out.push({label:'完成任务',at:task.completedAt});if(task.deletedAt)out.push({label:'移入回收站',at:task.deletedAt});if(task.previousId)out.push({label:'由上一重复实例生成',at:task.createdAt});return out.filter(e=>e.at).sort((a,b)=>b.at.localeCompare(a.at))}
