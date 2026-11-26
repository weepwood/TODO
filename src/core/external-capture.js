import {validDate,validTime,dayKey,migrateState} from './domain.js';
import {validDeadline} from './deadline.js';
import {taskFromCapture} from './task-defaults.js';
import {appendCapture} from './professional-workflow.js';
import {recordTaskChanges} from './task-activity.js';
import {assertCloudCapacity} from '../services/sync-durability.js';

export const EXTERNAL_LIMIT=50;
export class IntakeError extends Error{constructor(message,status=400){super(message);this.status=status}}
const fail=(message,status)=>{throw new IntakeError(message,status)};
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=['title','notes','listId','date','time','deadline','duration','priority','reminderAt'];
export function normalizeExternalTasks(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>EXTERNAL_LIMIT)fail('每批须包含1–50项任务');
 return rows.map((r,i)=>{
  const bad=()=>fail('第'+(i+1)+'项字段无效');
  if(!obj(r)||Object.keys(r).some(k=>!keys.includes(k))||typeof r.title!=='string'||!r.title.trim()||r.title.length>500)bad();
  const out={title:r.title.trim()};
  for(const k of ['notes','listId','date','time','deadline','reminderAt']){
   if(!Object.hasOwn(r,k))continue;
   const v=r[k];if(typeof v!=='string'||v.length>(k==='notes'?10000:200))bad();out[k]=v;
  }
  if(out.listId!==undefined&&!out.listId.trim()||out.date&&!validDate(out.date)||out.time&&(!validTime(out.time)||!out.date)||!validDeadline(out.deadline)||out.reminderAt&&!(out.reminderAt.length===16&&out.reminderAt[10]==='T'&&validDate(out.reminderAt.slice(0,10))&&validTime(out.reminderAt.slice(11))))bad();
  for(const [k,min,max] of [['duration',1,1440],['priority',0,3]])if(Object.hasOwn(r,k)){if(!Number.isInteger(r[k])||r[k]<min||r[k]>max)bad();out[k]=r[k]}
  return out;
 });
}
// Absolute local wall-clock inputs only. No server-time relative dates or private local defaults.
export function buildExternalCapture(state,request,now=new Date()){
 const data=migrateState(state),rows=normalizeExternalTasks(request.tasks);
 const tasks=rows.map((r,i)=>{
  const list=data.lists.find(l=>l.id===(r.listId??'inbox'));if(!list)fail('目标清单不存在，请拒绝该请求并重新提交',409);
  const t=taskFromCapture({parsed:{title:r.title,date:r.date||'',time:r.time||'',priority:r.priority??0},list,today:dayKey(now),now});
  return {...t,id:request.id+':'+(i+1),createdAt:now.toISOString(),notes:r.notes??'',duration:r.duration??t.duration,priority:r.priority??t.priority,...(r.deadline?{deadline:r.deadline}:{}),reminderAt:r.reminderAt||''};
 });
 const next=appendCapture(data,tasks);if(next===data)fail('无法追加任务，请检查工作空间与数量限制',409);
 const recorded=recordTaskChanges(data,next,{id:request.id,at:now.toISOString(),source:'device',session:'external:'+request.token_id});
 try{assertCloudCapacity(recorded)}catch{fail("工作空间容量不足",409)}
 return recorded.tasks.slice(data.tasks.length);
}
