import {blockMinutes,expandPlanBlocks} from './plan-block.js';
import {validPoints} from './points.js';
import {dayKey,shiftDay,validDate,id} from './domain.js';
export function nextWeekday(date,days,interval=1,origin=date){
 const selected=new Set(days);const monday=k=>shiftDay(k,-((new Date(k+'T12:00:00').getDay()+6)%7));
 const start=monday(origin);
 for(let i=1;i<=interval*7+7;i++){const k=shiftDay(date,i);const week=Math.round((Date.parse(monday(k)+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/604800000);if(week%interval===0&&selected.has(new Date(k+'T12:00:00').getDay()))return k}
 return null
}
export const offsetDate=(at,from,to)=>{if(!at||!validDate(from)||!validDate(to))return at||'';const diff=Math.round((Date.parse(at.slice(0,10)+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);return shiftDay(to,diff)+at.slice(10)};
export function blockers(tasks,task){return (task?.dependsOn||[]).map(id=>tasks.find(t=>t.id===id)).filter(t=>t&&!t.deletedAt&&t.status!=='completed')}
export function canLink(tasks,source,target,field='dependsOn'){
 if(!target)return true;if(source===target)return false;const seen=new Set(),stack=[target];
 while(stack.length){const id=stack.pop();if(id===source)return false;if(seen.has(id))continue;seen.add(id);const t=tasks.find(x=>x.id===id);if(t)stack.push(...(field==='parentId'?(t.parentId?[t.parentId]:[]):t.dependsOn||[]))}
 return true
}
export function descendants(tasks,tid){const result=[],seen=new Set([tid]),queue=[tid];while(queue.length){const parent=queue.pop();for(const t of tasks)if(t.parentId===parent&&!seen.has(t.id)){seen.add(t.id);result.push(t);queue.push(t.id)}}return result}
export function taskConflicts(tasks){const ranges=expandPlanBlocks(tasks).filter(t=>!t.deletedAt&&t.status==='pending'&&t.date&&t.time).map(t=>({id:t.id,ownerId:t.ownerId,start:new Date(t.date+'T'+t.time).getTime(),end:new Date(t.date+'T'+t.time).getTime()+blockMinutes(t)*60000})).sort((a,b)=>a.start-b.start);const conflicts=new Set();let max=null;for(const r of ranges){if(max&&r.start<max.end){conflicts.add(r.id);conflicts.add(max.id);if(r.ownerId)conflicts.add(r.ownerId);if(max.ownerId)conflicts.add(max.ownerId)}if(!max||r.end>max.end)max=r}return conflicts}
export function habitStreak(days,today=dayKey()){const set=new Set(days);let d=set.has(today)?today:shiftDay(today,-1),n=0;while(set.has(d)){n++;d=shiftDay(d,-1)}return n}
export function nextSlot(tasks,date,duration=30,start='09:00',end='18:00'){
 const a=new Date(date+'T'+start).getTime(),b=new Date(date+'T'+end).getTime(),len=duration*60000;let cursor=a;
 const ranges=expandPlanBlocks(tasks).filter(t=>!t.deletedAt&&t.status==='pending'&&t.date&&t.time).map(t=>{const s=new Date(t.date+'T'+t.time).getTime();return [s,s+blockMinutes(t)*60000]}).filter(([s,e])=>s<b&&e>a).sort((x,y)=>x[0]-y[0]);
 for(const [s,e] of ranges){if(cursor+len<=s)break;cursor=Math.max(cursor,e)}return cursor+len<=b?new Date(cursor).toTimeString().slice(0,5):null
}
export function quickParse(raw,today=dayKey()){
 let title=raw.trim(),date='',time='',priority=0;const flags=title.match(/(?:^|\s)!([1-3])(?=\s|$)/);if(flags){priority=+flags[1];title=title.replace(flags[0],' ')}
 const relative=title.match(/(?:^|\s)(今天|明天|后天)(?=\s|$)/);if(relative){date=shiftDay(today,['今天','明天','后天'].indexOf(relative[1]));title=title.replace(relative[0],' ')}
 const explicit=title.match(/(?:^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/);if(explicit&&validDate(explicit[1])){date=explicit[1];title=title.replace(explicit[0],' ')}
 const clock=title.match(/(?:^|\s)([01]\d|2[0-3]):([0-5]\d)(?=\s|$)/);if(clock){time=clock[1]+':'+clock[2];title=title.replace(clock[0],' ');date=date||today}
 const match=title.match(/(?:^|\s)积分([+-]?\d+)(?=\s|$)/);let points;if(match&&validPoints(Number(match[1]))){points=Number(match[1]);title=title.replace(match[0],' ')}
 return {title:title.trim(),date,time,priority,...(points===undefined?{}:{points})}
}
