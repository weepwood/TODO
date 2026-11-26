// Local management layer. Uses the existing planner and CLI domain operations.
// Durable references are provided by the native queue, never by model output.
import {dayKey,shiftDay,validDate,migrateState} from './domain.js';
import {executionPlan,planningWindows,calendarBusy,validPlanningWeek,validWorkHours,readPlannerPreferences} from './productivity.js';
import {readWeek,previewWeekReflow,applyWeekReflow} from './weekly-planner.js';
import {previewReflow,applyReflow} from './planner-interaction.js';
import {taskConflicts,blockers} from './advanced.js';
import {deadlineEnd} from './deadline.js';
import {blockMinutes,expandPlanBlocks} from './plan-block.js';
import {blockInterval} from './time-intervals.js';
import {planningEvidence,durationDiagnostics} from './duration-forecast.js';
import {focusSecondsByTask} from './pomodoro-planner.js';
import {buildReview,reviewPeriod} from './task-review.js';
import {digest} from '../services/cloud-core.js';
import {sameRecord} from './record-equality.js';

export const MANAGEMENT_OPS=['context','plan-preview','plan-explain','reflow-preview','changes-preview','split-preview','preview-apply','changes-undo','audit','review'];
const previews=['plan-preview','reflow-preview','changes-preview','split-preview'];
const ok=(v,code,message)=>{if(!v){const e=Error(message);e.code=code;throw e}};
const shape=(r,keys)=>ok(r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).every(k=>keys.includes(k)),'INVALID_ARGUMENT','未知或无效字段');
const int=(x,a,b)=>Number.isInteger(x)&&x>=a&&x<=b;
const pending=t=>t.status==='pending'&&!t.deletedAt;
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const version=t=>digest(t);
const active=(d,t)=>t.stage==='doing'||d.timer?.taskId===t.id;
const scheduleKeys=['date','time','anchor','planMinutes','planSegments'];
// Narrow reversible fields, never task lifecycle or destructive operations.
const reversibleKeys=[...scheduleKeys,'priority','listId','sectionId','tags','duration','deadline','reminderAt','remindedAt','extraReminders'];
const withoutActivity=d=>({...d,tasks:d.tasks.map(({activity,...t})=>t)});
const view=t=>({id:t.id,title:t.title,date:t.date,time:t.time,priority:t.priority,duration:t.duration,deadline:t.deadline,listId:t.listId,dependsOn:t.dependsOn,planLocked:!!t.planLocked,stage:t.stage});
const fullFingerprint=d=>digest(d);
function workOptions(r,now,preferencesStorage){
 const prefs=preferencesStorage?readPlannerPreferences(preferencesStorage):{workStart:'09:00',workEnd:'18:00'};
 const today=dayKey(now),date=r.date??today,days=r.days??1,start=r.start??prefs.workStart,end=r.end??prefs.workEnd,reserve=r.reserve??0;
 ok(validDate(date)&&date>=today&&int(days,1,7)&&validWorkHours(start,end)&&int(reserve,0,50),'INVALID_ARGUMENT','规划日期、时段、天数或余量无效');
 for(const key of ['ignoreWeek','includeBacklog'])ok(r[key]===undefined||typeof r[key]==='boolean','INVALID_ARGUMENT','布尔参数无效');
 const week=r.ignoreWeek?null:preferencesStorage?readWeek(preferencesStorage):null;
 ok(week===null||validPlanningWeek(week),'INVALID_ARGUMENT','工作周无效');
 return {date,days,options:{start,end,week,notBefore:+now,reserve,includeBacklog:r.includeBacklog??true,remainingBlocks:true,splitDays:days===1?0:days}};
}
function plan(d,r,now,storage){
 const {date,days,options}=workOptions(r,now,storage),all=[...d.tasks,...calendarBusy(d.calendarEvents||[])];
 const result=executionPlan(all,date,{...options,sessions:d.sessions,activeTaskId:d.timer?.taskId});
 return {date,days,options,result,all};
}
function summary(p){const {result}=p;return {date:p.date,days:p.days,capacity:result.capacity,placements:result.placements,skipped:result.skipped.slice(0,50),skippedTotal:result.skipped.length,optimization:result.optimization,policy:'有界启发式，不保证全局最优；仅当前候选，前置未完成的任务不会安排',workWeek:p.options.week,workStart:p.options.start,workEnd:p.options.end,reserve:p.options.reserve}}
function diff(d,next){
 const byId=new Map(d.tasks.map(t=>[t.id,t])),rows=[];
 for(const t of next.tasks){
  const old=byId.get(t.id);
  if(!old){rows.push({id:t.id,title:t.title,created:true,after:view(t)});continue}
  const keys=[...new Set([...Object.keys(old),...Object.keys(t)])].filter(k=>k!=='activity'&&!sameRecord(old[k],t[k]));
  if(keys.length)rows.push({id:t.id,title:t.title,fields:keys,before:Object.fromEntries(keys.map(k=>[k,old[k]??null])),after:Object.fromEntries(keys.map(k=>[k,t[k]??null]))});
 }
 const nextIds=new Set(next.tasks.map(t=>t.id));
 ok(next.tasks.length>=d.tasks.length&&d.tasks.every(t=>nextIds.has(t.id)),'UNSAFE_CHANGE','不允许删除任务');
 return rows;
}
function ensureConflicts(d,next,rows){
 const conflicts=taskConflicts([...next.tasks,...calendarBusy(next.calendarEvents||[])]);
 ok(!rows.some(r=>conflicts.has(r.id)),'TIME_CONFLICT','目标任务存在时间冲突');
 migrateState(next);
}
function ensureDeadline(next,rows,now){
 const ids=new Set(rows.filter(r=>r.created||r.fields?.some(k=>scheduleKeys.includes(k)||k==='deadline'||k==='duration')).map(r=>r.id));
 for(const t of expandPlanBlocks(next.tasks).filter(t=>ids.has(t.ownerId||t.id)&&pending(t)&&t.date&&t.time)){
  const [a,b]=blockInterval(t),due=deadlineEnd(t.deadline);
  ok(Number.isFinite(a)&&a>=+now&&Number.isFinite(b)&&(due===null||b<=due),'TIME_CONFLICT','新时间段已经过去、无效或超过截止期限');
 }
}
async function buildPreview(d,r,id,now,storage,base){
 let next=d,analysis={};
 if(r.op==='plan-preview'||r.op==='reflow-preview'){
  shape(r,['op','date','days','start','end','reserve','ignoreWeek','includeBacklog']);
  const p=plan(d,r,now,storage);analysis=summary(p);
  if(r.op==='plan-preview'){
   const byId=new Map(p.result.placements.map(({reason,remaining,...t})=>[t.id,t]));
   next={...d,tasks:d.tasks.map(t=>byId.has(t.id)?{...t,...byId.get(t.id)}:t)};
  }else{
   ok([1,3,7].includes(p.days)&&p.options.reserve===0,'INVALID_ARGUMENT','重排仅支持1/3/7天；不另设预留');
   const o={week:p.options.week,notBefore:+now};
   if(p.days===1){
    const rows=previewReflow(d,p.date,p.options.start,p.options.end,o);
    next=applyReflow(d,p.date,p.options.start,p.options.end,rows,o);analysis={date:p.date,days:p.days,workWeek:p.options.week,workStart:p.options.start,workEnd:p.options.end,reserve:0,reflow:rows,policy:"仅调整冲突的普通单段待办，保留已锁定、关联、重复和执行中任务"};
   }else{
    const week=p.options.week??Array.from({length:7},(_,day)=>({day,enabled:true,start:p.options.start,end:p.options.end}));
    const rows=previewWeekReflow(d,p.date,week,p.days,{notBefore:+now});
    next=applyWeekReflow(d,p.date,week,p.days,rows,{notBefore:+now});analysis={date:p.date,days:p.days,workWeek:p.options.week,workStart:p.options.start,workEnd:p.options.end,reserve:0,reflow:rows,policy:"仅调整冲突的普通单段待办，保留已锁定、关联、重复和执行中任务"};
   }
  }
 }else if(r.op==='changes-preview'){
  shape(r,['op','changes']);ok(Array.isArray(r.changes)&&int(r.changes.length,1,30),'INVALID_ARGUMENT','批量变更1–30项');
  const seen=new Set();
  for(const c of r.changes){
   shape(c,['id','version','fields']);
   ok(typeof c.id==='string'&&!seen.has(c.id)&&c.fields&&Object.keys(c.fields).length&&Object.keys(c.fields).every(k=>['date','time','blocks','planMinutes','duration','deadline','priority','listId','sectionId','tags','reminders','reminderOffsets','reminderAt'].includes(k)),'INVALID_ARGUMENT','仅允许不重复的普通任务安排与分类字段');
   seen.add(c.id);
   const t=d.tasks.find(t=>t.id===c.id);
   ok(t&&pending(t)&&!active(d,t)&&!t.planLocked&&t.repeat==='none'&&!t.seriesId&&!t.previousId&&!t.seriesHold,'UNSAFE_CHANGE','仅支持未执行、未锁定的普通待办');
   ok(await version(t)===c.version,'STALE_VERSION','目标版本已变化');
   next=(await base(next,{op:'update',...c,allowConflict:true},id+':'+seen.size,now)).next;
  }
 }else if(r.op==='split-preview'){
  shape(r,['op','id','version','children']);
  const parent=d.tasks.find(t=>t.id===r.id);
  ok(parent&&pending(parent)&&!active(d,parent)&&!parent.parentId&&parent.repeat==='none'&&!parent.seriesId&&!parent.previousId,'UNSAFE_CHANGE','父任务必须为普通未执行待办');
  ok(await version(parent)===r.version,'STALE_VERSION','父任务已变化');
  ok(Array.isArray(r.children)&&int(r.children.length,1,20),'INVALID_ARGUMENT','子任务1–20项');
  const tasks=r.children.map((c,i)=>{
   shape(c,['title','duration','checklist','after','notes','priority']);
   const {after=[],...fields}=c;
   ok(int(c.duration,1,1440)&&Array.isArray(after)&&after.every(n=>int(n,1,i))&&new Set(after).size===after.length,'INVALID_ARGUMENT','子任务需明确预计分钟；after仅引用前序1基序号');
   return {...fields,parentId:parent.id,listId:parent.listId,sectionId:parent.sectionId,dependsOn:after.map(n=>id+':'+n)};
  });
  next=(await base(d,{op:'create',tasks},id,now)).next;
  analysis={estimatedMinutes:tasks.reduce((s,t)=>s+t.duration,0),parentEstimate:parent.duration,estimateSource:'用户或AI提议，非实际耗时',undoSupported:false};
 }
 const rows=diff(d,next);
 if(rows.length){ensureConflicts(d,next,rows);ensureDeadline(next,rows,now)}
 return {next,rows,analysis};
}
function checkRef(ref,id,kinds,now){
 ok(uuid(id)&&ref?.id===id&&kinds.includes(ref.kind)&&ref.result&&ref.status==='saved','REFERENCE_INVALID','同工作空间有效回执不存在或已过期');
 ok(+now-Date.parse(ref.result.generatedAt)<=15*60000&&+now>=Date.parse(ref.result.generatedAt),'REFERENCE_EXPIRED','预览/撤销有效期15分钟，请重新计算');
 return ref.result;
}
function risk(t,now,evaluation,blocked){
 const due=deadlineEnd(t.deadline),reasons=[];
 if(due!==null&&due<+now)reasons.push('截止期限已过');
 if(blocked.length)reasons.push('等待前置任务');
 if(evaluation?.gapMinutes>0)reasons.push('候选范围容量不足 '+evaluation.gapMinutes+' 分钟');
 if(evaluation?.reason==='连续空闲时间不足')reasons.push('连续空闲时间不足');
 if(t.planLocked)reasons.push('已锁定');
 const risk=due!==null&&due<+now||evaluation?.gapMinutes>0?'high':blocked.length||evaluation?.reason==='连续空闲时间不足'?'attention':'unknown';
 return {risk,reasons,suggestion:risk==='high'?'优先核对截止期限、工时或重新规划':blocked.length?'优先处理前置任务':null,priority:t.priority};
}
async function contextRows(d,now,p,limit){
 const today=dayKey(now),end=shiftDay(today,6),all=d.tasks.filter(pending),focus=focusSecondsByTask(d.sessions);
 const ordered=all.filter(t=>!t.date||t.date<=end||t.deadline&&t.deadline.slice(0,10)<=end).sort((a,b)=>(deadlineEnd(a.deadline)??Infinity)-(deadlineEnd(b.deadline)??Infinity)||b.priority-a.priority||a.id.localeCompare(b.id));
 const skipped=new Map(p.result.skipped.map(x=>[x.id,x])),placements=new Map(p.result.placements.map(x=>[x.id,x]));
 return {counts:{pending:all.length,today:all.filter(t=>t.date===today).length,overdue:all.filter(t=>t.date&&t.date<today).length,upcoming:all.filter(t=>t.date>today&&t.date<=end).length,unscheduled:all.filter(t=>!t.date).length},total:ordered.length,rows:await Promise.all(ordered.slice(0,limit).map(async t=>{const blockedBy=blockers(d.tasks,t).map(x=>x.id),feasibility=skipped.get(t.id)??placements.get(t.id)??null;return {...view(t),version:await version(t),blockedBy,remainingEstimateMinutes:Math.ceil(Math.max(0,t.duration*60-(focus.get(t.id)||0))/60),deadlineOverdue:deadlineEnd(t.deadline)!==null&&deadlineEnd(t.deadline)<+now,feasibility,...risk(t,now,feasibility,blockedBy)}})),timer:d.timer?{taskId:d.timer.taskId,mode:d.timer.mode}:null,capacity:p.result.capacity,estimateCaveat:'预计减已记录专注，不等于真实剩余工时'};
}
function audit(d,now,limit,age){
 const today=dayKey(now),tasks=d.tasks.filter(pending),groups=new Map();
 for(const t of tasks){const k=t.title.normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');if(!k)continue;const group=groups.get(k)||[];group.push(t);groups.set(k,group)}
 const duplicates=[...groups.values()].filter(g=>g.length>1).map(g=>g.map(view));
 const backlog=tasks.filter(t=>Number.isFinite(Date.parse(t.createdAt))&&dayKey(new Date(t.createdAt))<=shiftDay(today,-age)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(t=>({...view(t),createdAt:t.createdAt,recordedScheduleChanges:(t.activity||[]).filter(e=>e.changes?.some(c=>['date','time','planSegments'].includes(c.field))).length}));
 const blocked=tasks.filter(t=>blockers(d.tasks,t).length).map(t=>({...view(t),blockedBy:blockers(d.tasks,t).map(x=>x.id)}));
 return {ageDays:age,backlogTotal:backlog.length,backlog:backlog.slice(0,limit),duplicateGroupsTotal:duplicates.length,duplicateGroups:duplicates.slice(0,limit).map(g=>({total:g.length,tasks:g.slice(0,5)})),blockedTotal:blocked.length,blocked:blocked.slice(0,limit),caveat:'标题规范化相同仅为候选，不证明重复；活动记录可能不完整，不自动删除或合并'};
}
export async function prepareManagement(d,r,id,now,{preferencesStorage=null,reference=null,base}={}){
 if(previews.includes(r.op)){
  const p=await buildPreview(d,r,id,now,preferencesStorage,base);
  const generatedAt=now.toISOString();
  return {next:d,result:{preview_id:id,kind:r.op,generatedAt,expiresAt:new Date(+now+15*60000).toISOString(),request:r,workspaceVersion:await fullFingerprint(d),rows:p.rows,analysis:p.analysis,proposalVersion:await digest(p.rows),undoSupported:r.op!=='split-preview'}};
 }
 if(r.op==='preview-apply'){
  shape(r,['op','previewId','confirm']);ok(r.confirm===true,'CONFIRM_REQUIRED','必须明确确认预览影响范围');
  const old=checkRef(reference,r.previewId,previews,now);
  ok(await fullFingerprint(d)===old.workspaceVersion,'STALE_VERSION','工作空间已变化，请重新预览');
  // Preserve deterministic split IDs/timestamps; all plan calculations use actual current time.
  const at=old.kind==='split-preview'?new Date(old.generatedAt):now;
  const fresh=await buildPreview(d,old.request,r.previewId,at,preferencesStorage,base);
  if(['plan-preview','reflow-preview'].includes(old.kind))ok(['workWeek','workStart','workEnd','reserve'].every(k=>sameRecord(fresh.analysis[k],old.analysis[k])),'STALE_PREVIEW','工作时间设置已变化');
  ok(fresh.rows.length&&await digest(fresh.rows)===old.proposalVersion,'STALE_PREVIEW','方案已改变或没有可提交变更，请重新预览');
  ensureDeadline(fresh.next===d?d:fresh.next,fresh.rows,now);
  return {next:fresh.next,result:{preview_id:r.previewId,affected:fresh.rows.length,rows:fresh.rows,generatedAt:now.toISOString()},managed:{undo:old.kind!=='split-preview',rows:fresh.rows}};
 }
 if(r.op==='changes-undo'){
  shape(r,['op','receiptId','confirm']);ok(r.confirm===true,'CONFIRM_REQUIRED','必须明确确认撤销');
  const old=checkRef(reference,r.receiptId,['preview-apply'],now);
  ok(old.undo?.supported&&await fullFingerprint(d)===old.undo.workspaceVersion,'STALE_VERSION','撤销不适用或工作空间已变化');
  const byId=new Map(old.undo.fields.map(r=>[r.id,r]));
  const next={...d,tasks:d.tasks.map(t=>{
   const row=byId.get(t.id);if(!row)return t;
   ok(pending(t)&&!t.planLocked&&!active(d,t),'UNSAFE_CHANGE','目标已锁定或执行');
   const out={...t};
   for(const [key,v] of Object.entries(row.before)){ok(reversibleKeys.includes(key),'UNSAFE_CHANGE','不可撤销字段');if(v.present)out[key]=v.value;else delete out[key]}
   return out;
  })};
  const rows=diff(d,next);ok(rows.length===byId.size,'STALE_VERSION','撤销范围不一致');ensureConflicts(d,next,rows);ensureDeadline(next,rows,now);
  return {next,result:{undone:r.receiptId,affected:rows.length},managed:{undo:false,rows}};
 }
 if(r.op==='context'||r.op==='plan-explain'){
  shape(r,['op','date','days','start','end','reserve','ignoreWeek','includeBacklog',r.op==='context'?'limit':'id']);
  const limit=r.limit??20;ok(int(limit,1,50),'INVALID_ARGUMENT','查询上限1–50');
  const p=plan(d,r.op==='context'?{...r,days:r.days??7}:r,now,preferencesStorage);
  if(r.op==='plan-explain'){
   const t=d.tasks.find(t=>t.id===r.id);ok(t&&pending(t),'NOT_FOUND','待办不存在');
   const row=p.result.placements.find(x=>x.id===t.id)??p.result.skipped.find(x=>x.id===t.id);
   const due=deadlineEnd(t.deadline);
   return {next:d,result:{task:{...view(t),version:await version(t)},...risk(t,now,row,blockers(d.tasks,t)),evaluation:row??{reason:'不属于当前调度候选；已有计划或超出候选范围'},blockedBy:blockers(d.tasks,t).map(x=>x.id),deadlineRemainingMinutes:due===null?null:Math.floor((due-+now)/60000),capacity:p.result.capacity}};
  }
  const c=await contextRows(d,now,p,limit),from=p.date,to=shiftDay(from,p.days-1);
  const blocks=expandPlanBlocks(p.all).filter(pending).filter(t=>t.time&&t.date&&t.date>=shiftDay(from,-1)&&t.date<=to).flatMap(t=>{const [a,b]=blockInterval(t);return Number.isFinite(a)&&b>+new Date(from+'T00:00:00')&&a<+new Date(shiftDay(to,1)+'T00:00:00')?[{id:t.ownerId||t.id,title:t.external?'外部忙碌时间':t.title,start:new Date(a).toISOString(),end:new Date(b).toISOString(),locked:!!t.planLocked,external:!!t.external}]:[]}).sort((a,b)=>a.start.localeCompare(b.start));
  return {next:d,result:{...c,calendar:blocks.slice(0,100),calendarTotal:blocks.length,asOf:now.toISOString()}};
 }
 if(r.op==='audit'){
  shape(r,['op','limit','ageDays']);const limit=r.limit??20,age=r.ageDays??30;ok(int(limit,1,50)&&int(age,1,3650),'INVALID_ARGUMENT','积压查询参数无效');return {next:d,result:audit(d,now,limit,age)};
 }
 if(r.op==='review'){
  shape(r,['op','date','period']);const today=dayKey(now),date=r.date??today,period=r.period??'week';
  ok(validDate(date)&&date<=today&&['day','week','month'].includes(period),'INVALID_ARGUMENT','回顾范围无效');
  const review=buildReview(d,reviewPeriod(date,today,period==='month'?'month':period==='week'));
  const evidence=planningEvidence(d,date),diagnostics=durationDiagnostics(evidence.samples);
  return {next:d,result:{since:review.since,until:review.until,completed:review.completed.length,planned:review.planned.length,outstanding:review.outstanding.length,overdue:review.overdue.length,focusMinutes:review.focusMinutes,plannedMinutes:review.plannedMinutes,habitCount:review.habitCount,conflictCount:review.conflictCount,completedExamples:review.completed.slice(0,20).map(view),outstandingExamples:review.outstanding.slice(0,20).map(view),calibration:{windowDays:180,...diagnostics,deadlineTotal:evidence.deadlineTotal,deadlineMet:evidence.deadlineMet,adjustmentRecords:evidence.adjustmentRecords,adjustmentTasks:evidence.adjustmentTasks},caveat:'当前计划不是历史快照；校准使用过去180天可追溯估计及已记录专注，非全部实际工时；零样本保持未知'}};
 }
 throw Error('unknown management operation');
}
// Reject if the shared editor/automation would make any unpreviewed change.
// Undo stores only changed field values, checks the actual persisted version.
export async function finalizeManagement(d,prepared,actual){
 if(!prepared.managed)return prepared.result;
 ok(sameRecord(withoutActivity(prepared.next),withoutActivity(actual)),'UNPREVIEWED_EFFECT','自动化或锁定产生额外变更，请在界面核对');
 const rows=prepared.managed.rows;
 const supported=prepared.managed.undo&&rows.every(r=>!r.created&&r.fields.every(k=>reversibleKeys.includes(k)));
 const fields=supported?rows.map(r=>({id:r.id,before:Object.fromEntries(r.fields.map(k=>{const t=d.tasks.find(t=>t.id===r.id);return [k,Object.hasOwn(t,k)?{present:true,value:t[k]}:{present:false}]}))})):[];
 return {...prepared.result,undo:{supported,workspaceVersion:supported?await fullFingerprint(actual):null,fields}};
}
