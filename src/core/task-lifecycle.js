import {blockMinutes} from './plan-block.js';
import {dayKey,shiftDay,validDate,nextOccurrence,advanceOccurrence} from './domain.js';
const seriesKey=t=>t.seriesId||t.id;
export function seriesOverview(tasks,id,today){
 const task=tasks.find(t=>t.id===id);if(!task)return null;
 const rows=tasks.filter(t=>seriesKey(t)===seriesKey(task)).sort((a,b)=>(b.occurrenceIndex||1)-(a.occurrenceIndex||1)||String(b.date).localeCompare(String(a.date)));
 const live=rows.filter(t=>!t.deletedAt&&t.status==='pending'),active=live.filter(t=>t.repeat!=='none');
 let next=null,reason='没有运行中的重复实例';
 if(rows.some(t=>!t.deletedAt&&t.seriesHold&&t.status!=='pending'))reason='存在历史暂停标记冲突，请检查系列管理中心';
 else if(active.length===1){
  const t=active[0];if(t.seriesHold)reason='系列已暂停，恢复后才继续生成';else if(validDate(t.date)){
   let date=nextOccurrence(t,t.repeat==='completion'?today:t.date),index=(t.occurrenceIndex||1)+1;
   if(t.miss==='skip')({next:date,index}=advanceOccurrence(t,date,index,today));
   if(!validDate(date)||(t.repeatUntil&&date>t.repeatUntil)||(t.repeatCount>0&&index>t.repeatCount))reason='已达到重复结束条件';
   else if(rows.some(r=>r.date===date&&(t.repeat!=='completion'||r.status==='pending'||r.previousId===t.id)))reason='目标实例已存在';
   else {next={date,index,conditional:t.repeat==='completion'};reason='当前实例完成后的预计日期'}
  }else reason='当前实例没有有效计划日期';
 }else if(active.length>1)reason='存在多个活动重复实例，不预测下一实例';
 return {rows,live,active,completed:rows.filter(t=>!t.deletedAt&&t.status==='completed').length,skipped:rows.filter(t=>!t.deletedAt&&t.status==='skipped').length,next,reason};
}
export function taskSuggestions(tasks,today){
 const byId=new Map(tasks.map(t=>[t.id,t])),groups={overdue:[],unscheduled:[],ready:[],blocked:[]},old=shiftDay(today,-7);
 for(const t of tasks){
  if(t.deletedAt||t.status!=='pending')continue;
  const deps=(t.dependsOn||[]).map(id=>byId.get(id)).filter(d=>d&&!d.deletedAt);
  const blockers=deps.filter(d=>d.status!=='completed');
  if(blockers.length)groups.blocked.push({task:t,reason:'等待 '+blockers.length+' 项前置任务'});
  if(validDate(t.date)&&t.date<today)groups.overdue.push({task:t,reason:'原计划 '+t.date});
  const created=Number.isFinite(Date.parse(t.createdAt))?dayKey(new Date(t.createdAt)):'';
  if(!t.date&&created&&created<=old)groups.unscheduled.push({task:t,reason:'创建于 '+created});
  if(deps.length&&!blockers.length)groups.ready.push({task:t,reason:'前置任务均已完成'});
 }
 for(const list of Object.values(groups))list.sort((a,b)=>String(a.task.date||a.task.createdAt).localeCompare(String(b.task.date||b.task.createdAt))||a.task.id.localeCompare(b.task.id));
 return groups;
}
export function closeoutEligible(t,today){return !t.deletedAt&&!t.planLocked&&!t.planSegments?.length&&t.status==='pending'&&t.repeat==='none'&&!t.seriesId&&!t.previousId&&validDate(t.date)&&t.date<=today}
export function closeoutPreview(tasks,ids,today){
 const wanted=new Set(ids);return tasks.filter(t=>wanted.has(t.id)&&closeoutEligible(t,today)).map(t=>({id:t.id,date:t.date,time:t.time,duration:blockMinutes(t)}));
}
export function applyCloseout(tasks,rows,today){
 if(!rows.length)return tasks;
 const now=closeoutPreview(tasks,rows.map(r=>r.id),today),byId=new Map(now.map(r=>[r.id,r]));
 if(rows.some(r=>{const t=byId.get(r.id);return !t||r.date!==t.date||r.time!==t.time||r.duration!==t.duration}))return tasks;
 const tomorrow=shiftDay(today,1);if(!validDate(tomorrow))return tasks;
 return tasks.map(t=>byId.has(t.id)?{...t,date:tomorrow,anchor:Number(tomorrow.slice(-2))}:t);
}
