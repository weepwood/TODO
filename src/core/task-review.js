import {dayKey,shiftDay,validDate} from './domain.js';
import {summarizePoints,signedPoints} from './points.js';
import {taskConflicts} from './advanced.js';
import {calendarBusy} from './productivity.js';

export function reviewPeriod(anchor,today,weekly=false){
 const date=validDate(anchor)&&anchor<=today?anchor:today;
 const monday=shiftDay(date,-((new Date(date+'T12:00:00').getDay()+6)%7));
 return weekly?{since:monday,until:[shiftDay(monday,6),today].sort()[0]}:{since:date,until:date};
}
const timestampDay=value=>Number.isFinite(Date.parse(value))?dayKey(new Date(value)):'';
export function buildReview(data,period){
 const {since,until}=period,inRange=d=>!!d&&d>=since&&d<=until;
 const tasks=data.tasks.filter(t=>!t.deletedAt);
 const completed=tasks.filter(t=>t.status==='completed'&&inRange(timestampDay(t.completedAt))).sort((a,b)=>b.completedAt.localeCompare(a.completedAt));
 const planned=tasks.filter(t=>inRange(t.date)&&t.status!=='skipped');
 const outstanding=planned.filter(t=>t.status==='pending');
 const overdue=tasks.filter(t=>t.status==='pending'&&t.date&&t.date<since);
 const sessions=data.sessions.filter(s=>s.mode!=='break'&&inRange(timestampDay(s.startedAt)));
 const habits=data.habits.map(h=>({id:h.id,name:h.name,count:new Set(h.days.filter(inRange)).size}));
 const conflictIds=taskConflicts([...tasks,...calendarBusy(data.calendarEvents||[])]);
 return {since,until,completed,planned,outstanding,overdue,plannedMinutes:planned.reduce((n,t)=>n+t.duration,0),focusMinutes:Math.round(sessions.reduce((n,s)=>n+s.seconds,0)/60),habitCount:habits.reduce((n,h)=>n+h.count,0),habits,points:summarizePoints(tasks,{since,today:until}).period.net,conflictCount:outstanding.filter(t=>conflictIds.has(t.id)).length};
}
const md=value=>String(value??'').replace(/[\r\n]+/g,' ').replace(/[\\`*_{}\[\]<>#|!]/g,'\\$&');
export function reviewMarkdown(r){
 const rows=(tasks)=>tasks.length?tasks.map(t=>'- '+md(t.title)+(t.date?'（'+t.date+'）':'')).join('\n'):'- 无';
 return ['# 任务回顾 '+r.since+(r.until===r.since?'':' 至 '+r.until),'','- 完成任务：'+r.completed.length+' 项','- 当前计划：'+r.plannedMinutes+' 分钟','- 实际专注：'+r.focusMinutes+' 分钟','- 习惯打卡：'+r.habitCount+' 次','- 净任务积分：'+signedPoints(r.points),'- 当前区间待办冲突：'+r.conflictCount+' 项','','## 已完成',rows(r.completed),'','## 当前未完成的区间计划',rows(r.outstanding),'','## 当前早于区间的积压',rows(r.overdue),'','## 习惯记录',r.habits.length?r.habits.map(h=>'- '+md(h.name)+'：'+h.count+' 次').join('\n'):'- 无','','> 基于导出时的当前数据；计划、积压和冲突并非历史快照。专注按开始日期归属，积分不扣除兑换支出。',''].join('\n');
}
export function pinFirst(tasks,pins){
 const ids=new Set(pins);
 return [...tasks.filter(t=>t.status==='pending'&&!t.deletedAt&&ids.has(t.id)),...tasks.filter(t=>t.status!=='pending'||t.deletedAt||!ids.has(t.id))];
}
export function undoOrdinaryCompletion(tasks,receipt){
 const t=tasks.find(t=>t.id===receipt.id);
 if(!t||t.deletedAt||t.status!=='completed'||t.completedAt!==receipt.completedAt||t.repeat!=='none'||t.seriesId||t.previousId||tasks.some(x=>!x.deletedAt&&x.status==='completed'&&x.dependsOn?.includes(t.id)))return tasks;
 return tasks.map(t=>t.id===receipt.id?{...t,status:'pending',stage:receipt.stage==='doing'?'doing':'todo',completedAt:null}:t);
}
