import {shiftDay} from './domain.js';
export const eventColor=(value,external=false)=>external?'#8d93a4':/^#[0-9a-f]{6}$/i.test(value||'')?value:'#5276d6';
// Sunday-first columns; local calendar dates, not elapsed UTC milliseconds.
export function heatmapCells(today,counts,days=364){
 const first=shiftDay(today,1-days),offset=new Date(first+'T12:00:00').getDay();
 return Array.from({length:days},(_,i)=>{const date=shiftDay(first,i),n=i+offset,count=counts[date]||0;return {date,count,row:n%7+1,column:Math.floor(n/7)+1,level:Math.min(4,Math.max(0,count))}});
}
export function groupFocusRecords(sessions,dayKey,limit=100){
 const groups=new Map();
 for(const session of sessions.slice(-limit).reverse()){
  const date=dayKey(new Date(session.startedAt));
  if(!groups.has(date))groups.set(date,{date,seconds:0,records:[]});
  const group=groups.get(date);group.records.push(session);group.seconds+=session.seconds;
 }
 return [...groups.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
