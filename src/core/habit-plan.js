import {shiftDay,validDate} from './domain.js';
export function validHabitSchedule(value){return value===undefined||Array.isArray(value)&&value.length>=1&&value.length<=7&&new Set(value).size===value.length&&value.every(d=>Number.isInteger(d)&&d>=0&&d<=6)}
export function habitPlanned(h,date){return validDate(date)&&(!h.planWeekdays||h.planWeekdays.includes(new Date(date+'T12:00:00').getDay()))}
export function habitWeek(h,date){
 const offset=(new Date(date+'T12:00:00').getDay()+6)%7,start=shiftDay(date,-offset);
 const planned=Array.from({length:7},(_,i)=>shiftDay(start,i)).filter(d=>habitPlanned(h,d));
 const completed=planned.filter(d=>d<=date&&h.days.includes(d)).length;
 return {start,planned,completed,elapsed:planned.filter(d=>d<=date).length};
}
