import {shiftDay,validDate} from './domain.js';
export function validHabitSchedule(value){return value===undefined||Array.isArray(value)&&value.length>=1&&value.length<=7&&new Set(value).size===value.length&&value.every(d=>Number.isInteger(d)&&d>=0&&d<=6)}
export function habitPlanned(h,date){if(!validDate(date))return false;const plan=habitPlanAt(h,date);return !!plan&&plan.days.includes(new Date(date+'T12:00:00').getDay())&&(!h.planVersions?.length||plan.enabled)}
export function habitWeek(h,date){
 const offset=(new Date(date+'T12:00:00').getDay()+6)%7,start=shiftDay(date,-offset);
 const planned=Array.from({length:7},(_,i)=>shiftDay(start,i)).filter(d=>habitPlanned(h,d));
 const completed=planned.filter(d=>d<=date&&h.days.includes(d)).length;
 return {start,planned,completed,elapsed:planned.filter(d=>d<=date).length};
}

export function validHabitVersions(rows){
 return rows===undefined||Array.isArray(rows)&&rows.length<=366&&rows.every((r,i)=>r&&validDate(r.from)&&Array.isArray(r.days)&&validHabitSchedule(r.days)&&typeof r.enabled==='boolean'&&(!i||rows[i-1].from<r.from));
}
export function habitPlanAt(h,date){
 if(h.planVersions?.length)return h.planVersions.findLast(r=>r.from<=date)||null;
 return {days:h.planWeekdays||[0,1,2,3,4,5,6],enabled:h.includeInPlan===true};
}
export function changeHabitPlan(h,fields,today){
 if(!validDate(today)||h.planVersions?.at(-1)?.from>today)return h;
 const next={...h,...fields},rows=h.planVersions||[],version={from:today,days:next.planWeekdays||[0,1,2,3,4,5,6],enabled:next.includeInPlan===true};
 const versions=[...rows.filter(r=>r.from!==today),version];if(!validHabitVersions(versions))return h;
 return {...next,planVersions:versions};
}
