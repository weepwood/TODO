import {dayKey,validDate} from './domain.js';
import {taskActivity} from './productivity.js';
import {displayActivity} from './task-activity.js';

const kinds={'创建任务':'created','完成任务':'completed','移入回收站':'deleted','由上一重复实例生成':'generated'};
export function activityTimeline(task){
 const sources={manual:'手动',bulk:'批量',automation:'自动化',system:'系统',undo:'撤销',redo:'重做',device:'本机附件',legacy:'已有记录'};
 const entries=displayActivity(task);
 // Keep the legacy invalid timestamp visible as unknown rather than fabricating a date.
 const invalid=taskActivity(task).filter(e=>!Number.isFinite(Date.parse(e.at))).map((e,i)=>({id:'legacy-unknown-'+i,kind:kinds[e.label]||'neutral',label:e.label,at:e.at,source:'legacy',category:'lifecycle',changes:[]}));
 return [...entries,...invalid].map(e=>{
  const date=new Date(e.at),valid=Number.isFinite(date.getTime());
  return {...e,day:valid?dayKey(date):'',time:valid?date.toTimeString().slice(0,5):'',dateTime:valid?date.toISOString():undefined,order:valid?date.getTime():-Infinity,sourceLabel:sources[e.source]};
 }).sort((a,b)=>b.order-a.order||(a.kind==='created'?-1:b.kind==='created'?1:0));

}
// Series entries represent scheduled instances, not an audit event timestamp.
export function seriesTimeline(tasks,task){
 const key=task.seriesId||task.id;
 return tasks.filter(t=>t.id!==task.id&&(t.seriesId||t.id)===key).map(t=>({
  id:t.id,kind:t.deletedAt?'deleted':t.status==='completed'?'completed':t.status==='skipped'?'skipped':'pending',
  label:t.deletedAt?'已删除':t.status==='completed'?'已完成':t.status==='skipped'?'已跳过':'待完成',
  detail:'第 '+(t.occurrenceIndex||1)+' 次',day:validDate(t.date)?t.date:'',index:t.occurrenceIndex||1
 })).sort((a,b)=>b.day.localeCompare(a.day)||b.index-a.index||a.id.localeCompare(b.id));
}
export function groupTimeline(entries){
 const groups=new Map();
 for(const e of entries){if(!groups.has(e.day))groups.set(e.day,[]);groups.get(e.day).push(e)}
 return Array.from(groups,([day,items])=>({day,items}));
}
