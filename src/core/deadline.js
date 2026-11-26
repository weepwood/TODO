import {validDate,validTime,shiftDay,dayKey} from './domain.js';
// Local wall-clock date or date+time. Empty string explicitly clears.
export function validDeadline(value){
 return value===undefined||value===''||typeof value==='string'&&(validDate(value)||value.length===16&&value[10]==='T'&&validDate(value.slice(0,10))&&validTime(value.slice(11)));
}
export function deadlineEnd(value){
 if(!value||!validDeadline(value))return null;
 return value.length===10?new Date(value+'T23:59:59.999').getTime():new Date(value).getTime();
}
export function deadlineStatus(task,now=new Date()){
 const end=deadlineEnd(task.deadline);if(end===null||task.deletedAt||task.status==='skipped')return '';
 if(task.status==='completed'&&task.completedAt&&Number.isFinite(Date.parse(task.completedAt)))return Date.parse(task.completedAt)<=end?'on-time':'late-completed';
 if(task.status!=='pending')return '';
 return +now>end?'overdue':task.deadline.slice(0,10)===dayKey(now)?'today':'upcoming';
}
export function repeatDeadline(task,nextDate){
 if(!task.deadline||!validDate(task.date)||!validDate(nextDate)||!validDeadline(task.deadline))return '';
 const days=Math.round((Date.parse(task.deadline.slice(0,10)+'T00:00:00Z')-Date.parse(task.date+'T00:00:00Z'))/86400000);
 const date=shiftDay(nextDate,days);return validDate(date)?date+task.deadline.slice(10):'';
}
export function deadlineInRange(task,day,mode){
 const date=task.deadline?.slice(0,10);
 return mode==='due-today'?date===day:mode==='due-overdue'?!!date&&date<day:mode==='due-next7'?!!date&&date>=day&&date<=shiftDay(day,6):mode==='due-none'?!date:false;
}
