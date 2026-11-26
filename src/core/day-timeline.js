import {shiftDay,validDate} from './domain.js';
import {blockInterval} from './time-intervals.js';
import {expandPlanBlocks} from './plan-block.js';
import {minuteClock,layoutTimeline} from './timeline-layout.js';
const MINUTE=60000;
export function clockOffset(instant){
 const d=new Date(instant),offset=-d.getTimezoneOffset(),sign=offset<0?'−':'+',n=Math.abs(offset);
 return d.toTimeString().slice(0,5)+' UTC'+sign+minuteClock(n);
}
export function elapsedDay(date){
 if(!validDate(date))return null;
 const start=+new Date(date+'T00:00:00'),end=+new Date(shiftDay(date,1)+'T00:00:00');
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
 return {start,end,minutes:(end-start)/MINUTE};
}
export function elapsedDayBlocks(tasks,date){
 const day=elapsedDay(date);if(!day)return [];
 const rows=expandPlanBlocks(tasks).filter(t=>!t.deletedAt&&t.status==='pending'&&t.date&&t.time).flatMap(t=>{
  const [a,b]=blockInterval(t),left=Math.max(day.start,a),right=Math.min(day.end,b);
  if(!Number.isFinite(left)||!Number.isFinite(right)||right<=left)return [];
  const start=Math.floor((left-day.start)/MINUTE),end=Math.ceil((right-day.start)/MINUTE);
  return [{...t,time:minuteClock(start),endTime:minuteClock(end),displayStart:clockOffset(left),displayEnd:right===day.end?'次日 00:00':clockOffset(right),carryIn:a<day.start,carryOut:b>day.end}];
 });
 return layoutTimeline(rows,0,day.minutes);
}
