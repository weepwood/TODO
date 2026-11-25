import {reviewInsights,validInsights} from './review-insights.js';
import {dayKey,shiftDay,validDate} from './domain.js';
import {taskPoints} from './points.js';
export const reviewMetricValues=r=>({completed:r.completed.length,plannedMinutes:r.plannedMinutes,focusMinutes:r.focusMinutes,habitCount:r.habitCount,points:r.points,conflicts:r.conflictCount});
export function reviewTrend(data,{since,until}){
 const rows=new Map();
 if(!validDate(since)||!validDate(until)||since>until)return [];
 for(let date=since;date<=until&&rows.size<31;date=shiftDay(date,1))rows.set(date,{date,completed:0,focusSeconds:0,points:0});
 const timestamp=value=>Number.isFinite(Date.parse(value))?dayKey(new Date(value)):'';
 for(const t of data.tasks){if(t.deletedAt||t.status!=='completed')continue;const r=rows.get(timestamp(t.completedAt));if(r){r.completed++;r.points+=taskPoints(t)}}
 for(const s of data.sessions){if(s.mode==='break')continue;const r=rows.get(timestamp(s.startedAt));if(r&&Number.isFinite(s.seconds)&&s.seconds>=0)r.focusSeconds+=s.seconds}
 return [...rows.values()].map(({focusSeconds,...r})=>({...r,focusMinutes:Math.round(focusSeconds/60)}));
}
export function previousComparablePeriod({since,until},weekly){
 if(weekly==='month'){const start=dayKey(new Date(Number(since.slice(0,4)),Number(since.slice(5,7))-2,1,12)),end=dayKey(new Date(Number(since.slice(0,4)),Number(since.slice(5,7))-1,0,12));return {since:start,until:[end,shiftDay(start,Number(until.slice(-2))-1)].sort()[0]}}
 const offset=weekly?-7:-1;return {since:shiftDay(since,offset),until:shiftDay(until,offset)};
}
export function validVisual(v){
 const metrics=['completed','plannedMinutes','focusMinutes','habitCount','points','conflicts'];
 return v&&(v.insights===undefined||validInsights(v.insights))&&metrics.every(k=>Number.isFinite(v.metrics?.[k])&&(k==='points'||v.metrics[k]>=0))&&Array.isArray(v.trend)&&v.trend.length>=1&&v.trend.length<=31&&(v.lists===undefined||Array.isArray(v.lists)&&v.lists.length<=100001&&v.lists.every(r=>typeof r.id==='string'&&typeof r.name==='string'&&Number.isFinite(r.planned)&&r.planned>=0&&Number.isFinite(r.actual)&&r.actual>=0))&&(v.months===undefined||Array.isArray(v.months)&&v.months.length===6&&v.months.every(r=>/^\d{4}-\d{2}$/.test(r.month)&&Number.isFinite(r.completed)&&r.completed>=0&&Number.isFinite(r.focusMinutes)&&r.focusMinutes>=0&&Number.isFinite(r.points)))&&v.trend.every(r=>validDate(r.date)&&['completed','focusMinutes','points'].every(k=>Number.isFinite(r[k])&&(k==='points'||r[k]>=0)));
}

export function listTime(data,{since,until}){
 const tasks=new Map(data.tasks.filter(t=>!t.deletedAt).map(t=>[t.id,t])),lists=new Map(data.lists.map(l=>[l.id,{id:l.id,name:l.name,planned:0,seconds:0}]));
 lists.set('unknown',{id:'unknown',name:'未绑定或已移除任务',planned:0,seconds:0});
 const range=d=>d&&d>=since&&d<=until;
 for(const t of data.tasks)if(!t.deletedAt&&t.status!=='skipped'&&range(t.date))(lists.get(t.listId)||lists.get('unknown')).planned+=t.duration;
 for(const s of data.sessions)if(s.mode!=='break'&&Number.isFinite(Date.parse(s.startedAt))&&range(dayKey(new Date(s.startedAt))))(lists.get(tasks.get(s.taskId)?.listId)||lists.get('unknown')).seconds+=s.seconds;
 return [...lists.values()].filter(r=>r.planned||r.seconds).map(({seconds,...r})=>({...r,actual:Math.round(seconds/60)})).sort((a,b)=>b.actual-a.actual||b.planned-a.planned);
}
export function longTrend(data,today){
 const months=Array.from({length:6},(_,i)=>dayKey(new Date(Number(today.slice(0,4)),Number(today.slice(5,7))-6+i,1,12)).slice(0,7));
 const rows=new Map(months.map(month=>[month,{month,completed:0,seconds:0,points:0}]));
 const get=v=>Number.isFinite(Date.parse(v))&&dayKey(new Date(v))<=today?rows.get(dayKey(new Date(v)).slice(0,7)):null;
 for(const t of data.tasks)if(!t.deletedAt&&t.status==='completed'){const r=get(t.completedAt);if(r){r.completed++;r.points+=taskPoints(t)}}
 for(const s of data.sessions)if(s.mode!=='break'){const r=get(s.startedAt);if(r)r.seconds+=s.seconds}
 return [...rows.values()].map(({seconds,...r})=>({...r,focusMinutes:Math.round(seconds/60)}));
}
export function makeVisual(data,r){return {metrics:reviewMetricValues(r),trend:reviewTrend(data,r),lists:listTime(data,r),months:longTrend(data,r.until),insights:reviewInsights(data,r)}}
