import {dayKey,shiftDay,validDate} from './domain.js';
// Local-calendar boundaries, same number of days in each period.
export function activityComparison(today,range,counts){
 if(!validDate(today)||![7,14,30,90].includes(range))return [];
 return Array.from({length:range},(_,i)=>{const date=shiftDay(today,i-range+1),previousDate=shiftDay(date,-range);return {date,previousDate,current:counts[date]||0,previous:counts[previousDate]||0}});
}
export function activityDay(data,date,list='all'){
 if(!validDate(date))return {tasks:[],sessions:[],focusMinutes:0};
 const tasks=data.tasks.filter(t=>!t.deletedAt),byId=new Map(tasks.map(t=>[t.id,t]));
 const dateOf=v=>Number.isFinite(Date.parse(v))?dayKey(new Date(v)):'';
 const completed=tasks.filter(t=>t.status==='completed'&&dateOf(t.completedAt)===date&&(list==='all'||t.listId===list));
 const sessions=data.sessions.filter(s=>s.mode!=='break'&&dateOf(s.startedAt)===date&&(list==='all'||byId.get(s.taskId)?.listId===list));
 return {tasks:completed,sessions:sessions.map(s=>({...s,title:byId.get(s.taskId)?.title||'未绑定或已移除任务'})),focusMinutes:Math.round(sessions.reduce((n,s)=>n+s.seconds,0)/60)};
}
