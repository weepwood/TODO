// Compensate selected, verified task fields, never replace a workspace snapshot.
import {digest} from '../services/cloud-core.js';
import {sameRecord} from './record-equality.js';
import {migrateState,STORAGE_KEY} from './domain.js';
import {taskConflicts} from './advanced.js';
import {calendarBusy} from './productivity.js';
import {expandPlanBlocks} from './plan-block.js';
import {blockInterval} from './time-intervals.js';
import {deadlineEnd} from './deadline.js';

export const HISTORY_OPS=['history-list','history-show','history-preview','history-apply'];
const fail=(code,message)=>{const e=Error(message);e.code=code;throw e};
const check=(v,c,m)=>{if(!v)fail(c,m)};
const shape=(r,keys)=>check(r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).every(k=>keys.includes(k)),'INVALID_ARGUMENT','历史操作参数无效');
const field=(t,k)=>Object.hasOwn(t,k)?{present:true,value:t[k]}:{present:false};
const schedule=['date','time','anchor','duration','deadline','planMinutes','planSegments'];
const classification=['listId','sectionId','tags'];
const safe=['title','priority',...schedule,...classification,'deletedAt'];
const ordinary=t=>t&&t.status==='pending'&&t.stage!=='doing'&&t.repeat==='none'&&!t.seriesId&&!t.previousId&&!t.seriesHold&&!t.planLocked;
const touches=(row,keys)=>row.created||row.removed||row.unattributed||Object.hasOwn(row.fields||{},'deletedAt')||row.protected?.some(k=>['status','stage','repeat','seriesId','previousId','seriesHold','planLocked','deletedAt','remindedAt','extraReminders','reminderAt','completedAt'].includes(k))||Object.keys(row.fields||{}).some(k=>keys.includes(k));
const used=(d,t)=>d.timer?.taskId===t.id||d.sessions?.some(s=>s.taskId===t.id)||d.tasks.some(x=>!x.deletedAt&&x.id!==t.id&&(x.parentId===t.id||x.dependsOn?.includes(t.id)||x.previousId===t.id));
const delivered=t=>!!t.remindedAt||t.extraReminders?.some(r=>r.sentAt);
const taskMap=d=>new Map(d.tasks.map(t=>[t.id,t]));
const applyField=(t,k,v)=>{if(v.present)t[k]=v.value;else delete t[k]};
const describe=(t,k)=>field(t,k);
const selectionFor=(selection,id)=>!selection?{id}:selection.find(s=>s.id===id);
// A history read must refer to the exact committed native workspace, not an
// earlier journal fetched while the asynchronous native store was draining.
export async function snapshotFingerprint(raw){
 const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
 return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function readConsistentHistory(storage,expected,read){
 check(storage?.flush&&await storage.flush(),'STALE_WORKSPACE','本机保存尚未完成');
 const raw=storage.getItem(STORAGE_KEY);
 check(typeof raw==='string'&&sameRecord(JSON.parse(raw),expected),'STALE_WORKSPACE','工作空间已变化，请重新查询');
 const hash=await snapshotFingerprint(raw),journal=await read();
 check(journal?.workspaceFingerprint===hash&&storage.getItem(STORAGE_KEY)===raw,'STALE_WORKSPACE','历史与当前已保存工作空间不一致，请重新查询');
 return journal;
}
export async function buildHistoryPreview(d,request,journal,now=new Date()){
 shape(request,['op','version','afterVersion','groupId','selection']);
 check(journal?.intact,'HISTORY_GAP','日志连续性未知，不能安全恢复');
 const selector=['version','afterVersion','groupId'].filter(k=>request[k]!==undefined);
 check(selector.length===1,'INVALID_ARGUMENT','请选择一个版本、操作组或目标历史时刻');
 const entries=journal.entries||[];
 const head=journal.head;
 const integer=v=>Number.isSafeInteger(v)&&v>=0;
 let selected;
 if(request.version!==undefined){check(integer(request.version)&&request.version>0,'INVALID_ARGUMENT','版本无效');selected=entries.filter(e=>e.version===request.version)}
 else if(request.groupId!==undefined){check(typeof request.groupId==='string'&&/^[0-9a-f-]{36}$/i.test(request.groupId),'INVALID_ARGUMENT','操作组无效');selected=entries.filter(e=>e.groupId===request.groupId)}
 else{check(integer(request.afterVersion)&&request.afterVersion<head,'INVALID_ARGUMENT','历史时刻无效');selected=entries.filter(e=>e.version>request.afterVersion&&e.source==='cli')}
 check(selected.length,'HISTORY_NOT_FOUND','所选历史无可用操作');
 // Group and time restoration require the entire retained range, never silently truncate.
 const oldest=request.afterVersion!==undefined?request.afterVersion+1:Math.min(...selected.map(e=>e.version));
 check(request.groupId===undefined||entries.at(-1)?.version===1,'HISTORY_GAP','操作组可能已被截断，改为指定版本恢复');
 const range=entries.filter(e=>e.version>=oldest);
 check(range.length===head-oldest+1&&range.every((e,i)=>e.version===head-i&&!e.gap&&e.body&&!e.body.gap),'HISTORY_GAP','历史范围不连续或超出读取预算');
 const sel=request.selection;
 if(sel!==undefined){
  check(Array.isArray(sel)&&sel.length>=1&&sel.length<=50&&sel.every(s=>s&&typeof s==='object'&&!Array.isArray(s))&&new Set(sel.map(s=>s.id)).size===sel.length,'INVALID_ARGUMENT','选择范围无效');
  for(const s of sel){shape(s,['id','fields']);check(typeof s.id==='string'&&s.id.length>0&&selected.some(e=>e.body.rows.some(r=>r.id===s.id))&&(s.fields===undefined||Array.isArray(s.fields)&&s.fields.length&&s.fields.every(k=>safe.includes(k))&&new Set(s.fields).size===s.fields.length),'INVALID_ARGUMENT','选择字段无效')}
 }
 const chosen=new Set(selected.map(e=>e.version)),initial=taskMap(d),working=new Map(initial),conflicts=[],changed=new Set(),blockedFields=new Map();
 const blocked=(id,version,reason,fields=[],comparison)=>{conflicts.push({id,version,reason,fields,...(comparison?{comparison}:{})});if(id){const set=blockedFields.get(id)||new Set();for(const k of fields.length?fields:safe)set.add(k);blockedFields.set(id,set)}};
 for(const e of range){
  if(!chosen.has(e.version))continue;
  if(e.body.protectedWorkspace?.length)blocked(null,e.version,'工作空间级变化仅记录，不自动恢复',e.body.protectedWorkspace);
  for(const row of e.body.rows){
   const s=selectionFor(sel,row.id);if(!s)continue;
   const t=working.get(row.id),original=initial.get(row.id);
   const later=range.filter(x=>x.version>e.version&&!chosen.has(x.version)).flatMap(x=>x.body.rows.filter(r=>r.id===row.id));
   if(!ordinary(t)||d.timer?.taskId===t.id){blocked(row.id,e.version,'任务不存在、已执行、重复或锁定');continue}
   if(row.removed){blocked(row.id,e.version,'永久删除不恢复');continue}
   if(row.unattributed){blocked(row.id,e.version,'同一次保存中来源无法明确，禁止自动恢复');continue}
   if(row.created){
    if(s.fields||t.deletedAt||used(d,t)||delivered(t)||later.length||await digest(original)!==row.afterHash){blocked(row.id,e.version,'新建任务已有后续使用、修改或不适合撤回');continue}
    working.set(row.id,{...t,deletedAt:now.toISOString()});changed.add(row.id);continue;
   }
   if(row.protected?.length){blocked(row.id,e.version,'受保护字段不恢复',row.protected);if(row.protected.some(k=>['status','stage','repeat','seriesId','previousId','seriesHold','planLocked','completedAt','points'].includes(k)))continue}
   const fields=Object.keys(row.fields||{}),requested=fields.filter(k=>!s.fields||s.fields.includes(k));
   const groups=[schedule,classification,['title'],['priority'],['deletedAt']];
   let out={...t},applied=false;
   for(const group of groups){
    const keys=fields.filter(k=>group.includes(k));if(!keys.some(k=>requested.includes(k)))continue;
    if(keys.some(k=>!requested.includes(k))){blocked(row.id,e.version,'关联字段必须一起恢复',keys);continue}
    if(group.some(k=>blockedFields.get(row.id)?.has(k))||later.some(r=>touches(r,group))||keys.some(k=>!sameRecord(field(t,k),row.fields[k].after))){blocked(row.id,e.version,'后续编辑冲突，保留当前值',keys,keys.map(k=>({field:k,before:row.fields[k].before,after:row.fields[k].after,current:field(t,k)})));continue}
    if(group===schedule&&(t.reminderAt||t.extraReminders?.length||row.protected?.some(k=>['reminderAt','remindedAt','extraReminders','repeat','status'].includes(k)))){blocked(row.id,e.version,'关联提醒或生命周期不可安全恢复',keys);continue}
    if(group[0]==='deletedAt'&&(used(d,t)||delivered(t)||row.protected?.length)){blocked(row.id,e.version,'任务已被使用或存在保护记录',keys);continue}
    if(t.deletedAt&&group[0]!=='deletedAt'){blocked(row.id,e.version,'任务已在回收站',keys);continue}
    for(const k of keys)applyField(out,k,row.fields[k].before);applied=true;
   }
   if(applied){working.set(row.id,out);changed.add(row.id)}
  }
 }
 const next={...d,tasks:d.tasks.map(t=>working.get(t.id))};
 const rows=[...changed].flatMap(id=>{const a=initial.get(id),b=working.get(id),fields=safe.filter(k=>!sameRecord(field(a,k),field(b,k)));return fields.length?[{id,title:a.title,fields:Object.fromEntries(fields.map(k=>[k,{before:describe(a,k),after:describe(b,k)}]))}]:[]});
 // Reject rather than auto-fix any invalid classification or schedule.
 const conflictsNow=taskConflicts([...next.tasks,...calendarBusy(next.calendarEvents||[])]);
 for(const r of rows){
  const t=working.get(r.id),l=d.lists.find(l=>l.id===t.listId);
  check(l&&(!t.sectionId||l.sections.some(s=>s.id===t.sectionId))&&t.tags.every(id=>d.tags.some(tag=>tag.id===id)),'UNSAFE_CHANGE','历史分类已不存在');
  const scheduling=Object.keys(r.fields).some(k=>schedule.includes(k)||k==='deletedAt');
  if(scheduling&&!t.deletedAt){
   check(!conflictsNow.has(t.id),'TIME_CONFLICT','恢复会产生时间冲突');
   for(const b of expandPlanBlocks([t]).filter(x=>x.date&&x.time)){const [a,z]=blockInterval(b),due=deadlineEnd(t.deadline);check(Number.isFinite(a)&&a>=+now&&Number.isFinite(z)&&(due===null||z<=due),'TIME_CONFLICT','不能恢复过去或超过截止期限的时段')}
  }
 }
 migrateState(next);
 return {next:rows.length?next:d,rows,conflicts,versions:selected.map(e=>e.version),head};
}
export async function prepareHistory(d,r,id,now,{journal,reference}={}){
 if(r.op==='history-list'||r.op==='history-show'){
  shape(r,r.op==='history-list'?['op','limit']:['op','version']);
  check(journal?.intact,'HISTORY_GAP','日志连续性未知');
  if(r.op==='history-show'){check(Number.isSafeInteger(r.version)&&r.version>0,'INVALID_ARGUMENT','版本无效');const entry=journal.entries.find(e=>e.version===r.version);check(entry,'HISTORY_NOT_FOUND','版本不存在或超出读取预算');return {next:d,result:{entry}}}
  const limit=r.limit??20;check(Number.isInteger(limit)&&limit>=1&&limit<=50,'INVALID_ARGUMENT','查询上限1–50');return {next:d,result:{head:journal.head,entries:journal.entries.slice(0,limit),retentionDays:30}};
 }
 if(r.op==='history-preview'){
  const p=await buildHistoryPreview(d,r,journal,now);
  return {next:d,result:{preview_id:id,request:r,generatedAt:now.toISOString(),workspaceVersion:await digest(d),rows:p.rows,conflicts:p.conflicts,versions:p.versions,head:p.head,proposal:await digest(p.rows)}};
 }
 shape(r,['op','previewId','confirm']);
 check(r.confirm===true,'CONFIRM_REQUIRED','必须明确请求恢复，并在应用内确认');
 const old=reference?.result;
 check(reference?.kind==='history-preview'&&reference.status==='saved'&&reference.id===r.previewId&&old,'REFERENCE_INVALID','恢复预览不存在');
 const at=new Date(old.generatedAt);
 check(+now>=+at&&+now-+at<=15*60000,'REFERENCE_EXPIRED','请重新生成恢复预览');
 check(await digest(d)===old.workspaceVersion,'STALE_VERSION','工作空间已变化，请重新预览');
 const p=await buildHistoryPreview(d,old.request,journal,at);
 // Recheck time at apply, even if the original preview had future blocks.
 for(const row of p.rows){const t=p.next.tasks.find(t=>t.id===row.id);if(!t.deletedAt&&Object.keys(row.fields).some(k=>schedule.includes(k)||k==='deletedAt'))for(const b of expandPlanBlocks([t]).filter(x=>x.date&&x.time))check(blockInterval(b)[0]>=+now,'TIME_CONFLICT','预览时间段已过去')}
 check(p.rows.length&&p.head===old.head&&await digest(p.rows)===old.proposal,'STALE_PREVIEW','恢复范围已改变或没有安全变更');
 return {next:p.next,result:{preview_id:r.previewId,affected:p.rows.length,rows:p.rows,conflicts:p.conflicts},historyRecovery:true};
}
export function confirmationText(op,before,after){
 const old=taskMap(before),rows=[];
 for(const t of after.tasks){
  const a=old.get(t.id);
  if(!a){const {activity,...record}=t;rows.push('新建：'+t.title+'\n'+JSON.stringify(record,null,2));continue}
  const keys=[...new Set([...Object.keys(a),...Object.keys(t)])].filter(k=>k!=='activity'&&!sameRecord(a[k],t[k]));
  if(keys.length)rows.push(t.title+'\n'+keys.map(k=>k+': '+JSON.stringify(a[k]??null)+' → '+JSON.stringify(t[k]??null)).join('\n'));
 }
 const other=Object.keys(after).filter(k=>k!=='tasks'&&!sameRecord(before[k],after[k]));
 if(other.length)rows.push('其他工作空间字段：\n'+other.map(k=>k+': '+JSON.stringify(before[k]??null)+' → '+JSON.stringify(after[k]??null)).join('\n'));
 const message='确认本地 CLI 操作 '+op+'？\n\n'+rows.join('\n\n')+'\n\n请核对完整影响范围，取消将不保存。';
 check(message.length<=16000,'CONFIRM_TOO_LARGE','确认内容过长，请拆分操作');
 return message;
}
