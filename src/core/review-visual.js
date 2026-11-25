import {dayKey,shiftDay,validDate} from './domain.js';
import {taskPoints} from './points.js';
export const reviewMetricValues=r=>({completed:r.completed.length,plannedMinutes:r.plannedMinutes,focusMinutes:r.focusMinutes,habitCount:r.habitCount,points:r.points,conflicts:r.conflictCount});
export function reviewTrend(data,{since,until}){
 const rows=new Map();
 if(!validDate(since)||!validDate(until)||since>until)return [];
 for(let date=since;date<=until&&rows.size<7;date=shiftDay(date,1))rows.set(date,{date,completed:0,focusSeconds:0,points:0});
 const timestamp=value=>Number.isFinite(Date.parse(value))?dayKey(new Date(value)):'';
 for(const t of data.tasks){if(t.deletedAt||t.status!=='completed')continue;const r=rows.get(timestamp(t.completedAt));if(r){r.completed++;r.points+=taskPoints(t)}}
 for(const s of data.sessions){if(s.mode==='break')continue;const r=rows.get(timestamp(s.startedAt));if(r&&Number.isFinite(s.seconds)&&s.seconds>=0)r.focusSeconds+=s.seconds}
 return [...rows.values()].map(({focusSeconds,...r})=>({...r,focusMinutes:Math.round(focusSeconds/60)}));
}
export function previousComparablePeriod({since,until},weekly){
 const offset=weekly?-7:-1;return {since:shiftDay(since,offset),until:shiftDay(until,offset)};
}
export function validVisual(v){
 const metrics=['completed','plannedMinutes','focusMinutes','habitCount','points','conflicts'];
 return v&&metrics.every(k=>Number.isFinite(v.metrics?.[k])&&(k==='points'||v.metrics[k]>=0))&&Array.isArray(v.trend)&&v.trend.length>=1&&v.trend.length<=7&&v.trend.every(r=>validDate(r.date)&&['completed','focusMinutes','points'].every(k=>Number.isFinite(r[k])&&(k==='points'||r[k]>=0)));
}
