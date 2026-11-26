// Local-only business operations. Cloud intake remains on the original narrow contract.
// Every mutation is prepared from a single immutable workspace and applied by the
// existing editor/history. No direct SQLite workspace mutation from a CLI process.
import {dayKey,shiftDay,validDate,validTime,completeTask,reopenTask,seriesPatch,matches,moveTaskToList,migrateState} from './domain.js';
import {prepareExternalTasks,normalizeExternalTasks} from './external-capture.js';
import {appendCapture} from './professional-workflow.js';
import {scheduleSnapshot,scheduleChanges,reminderBefore} from './task-schedule.js';
import {blockPatch,expandPlanBlocks,blockMinutes} from './plan-block.js';
import {uniqueWallInstant} from './wall-time.js';
import {blockInterval} from './time-intervals.js';
import {taskConflicts} from './advanced.js';
import {calendarBusy} from './productivity.js';
import {seriesSafetyKeys,seriesControl} from './series-control.js';
import {previewPostpone,applyPostpone} from './task-defaults.js';
import {buildReview,reviewPeriod,undoOrdinaryCompletion} from './task-review.js';
import {startFocusTimer,changeFocusTimer,focusTimerKey} from './focus-engine.js';
import {digest} from '../services/cloud-core.js';
import {sameRecord} from './record-equality.js';
import {saveOrganizationEntity} from './organization.js';
import {appendHabit,setHabitChecked} from './habit-plan.js';
import {HISTORY_OPS,prepareHistory} from './operation-history.js';
import {MANAGEMENT_OPS,prepareManagement} from './cli-management.js';

const fail=m=>{throw Error(m)};
const own=(o,k)=>Object.hasOwn(o,k);
const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const check=(v,m)=>{if(!v)fail(m)};
const shape=(o,allowed)=>check(obj(o)&&Object.keys(o).every(k=>allowed.includes(k)),'未知或无效字段');
const string=(v,max=500)=>typeof v==='string'&&v.trim()&&v.length<=max;
const integer=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
const listOf=(v,max)=>Array.isArray(v)&&v.length<=max;
const stamp=v=>typeof v==='string'&&v.length===16&&v[10]==='T'&&validDate(v.slice(0,10))&&validTime(v.slice(11))&&uniqueWallInstant(v.slice(0,10),v.slice(11))!==null;
const ruleKeys=['repeat','interval','weekdays','repeatUntil','repeatCount','miss','reset'];
const baseKeys=['title','notes','listId','date','time','deadline','duration','priority','reminderAt'];
const richKeys=[...baseKeys,...ruleKeys,'sectionId','tags','checklist','parentId','dependsOn','reminders','reminderOffsets','blocks','planMinutes','planLocked'];
const pending=t=>t&&t.status==='pending'&&!t.deletedAt;
const taskBy=(d,id)=>d.tasks.find(t=>t.id===id);
const series=t=>t.seriesId||t.id;
const version=async t=>digest(t??null);
const expectVersion=async(t,v)=>check(typeof v==='string'&&await version(t)===v,'目标已变化，请重新查询版本');
const itemView=async(t,detail=false)=>{
 const {id,title,listId,sectionId,tags,date,time,duration,deadline,priority,status,repeat,interval,weekdays,repeatUntil,repeatCount,miss,reset,reminderAt,extraReminders,planSegments,planLocked,parentId,dependsOn,seriesId,previousId,seriesStart,occurrenceIndex,seriesHold,deletedAt,completedAt,stage}=t;
 return {id,title,listId,sectionId,tags,date,time,duration,deadline,priority,status,repeat,interval,weekdays,repeatUntil,repeatCount,miss,reset,reminderAt,extraReminders,planMinutes:blockMinutes(t),planSegments:planSegments||[],planLocked:!!planLocked,parentId,dependsOn,seriesId,previousId,seriesStart,occurrenceIndex,seriesHold,deletedAt,completedAt,stage,...(detail?{notes:t.notes,checklist:t.checklist}:{}),version:await version(t)};
};
function blockRows(rows,requestId){
 check(listOf(rows,31)&&rows.length,'时间段须为1–31项');
 return rows.map((r,i)=>{
  shape(r,['date','start','end','endDate']);
  const endDate=r.endDate??r.date;
  check(validDate(r.date)&&validDate(endDate)&&validTime(r.start)&&validTime(r.end),'时间段日期或时间无效');
  const a=uniqueWallInstant(r.date,r.start),b=uniqueWallInstant(endDate,r.end),minutes=(b-a)/60000;
  check(a!==null&&b!==null&&integer(minutes,1,1440),'时间段必须为1–1440分钟且墙钟时间唯一');
  return {id:requestId+':segment:'+i,date:r.date,time:r.start,minutes};
 });
}
function validateRules(t){
 check(['none','daily','weekly','monthly','workdays','weekdays','completion'].includes(t.repeat)&&integer(t.interval,1,365)&&listOf(t.weekdays,7)&&new Set(t.weekdays).size===t.weekdays.length&&t.weekdays.every(x=>integer(x,0,6)),'重复规则无效');
 check(t.repeat!=='weekdays'||t.weekdays.length,'指定星期不能为空');
 check(t.repeat!=='workdays'||t.interval===1,'工作日模式不支持自定义间隔，请使用指定星期');
 check((!t.repeatUntil||validDate(t.repeatUntil)&&t.repeatUntil>=t.date)&&integer(t.repeatCount,0,100000)&&(!t.repeatCount||t.repeatCount>=(t.occurrenceIndex||1))&&['keep','skip'].includes(t.miss)&&validTime(t.reset),'重复结束条件或重置规则无效');
 check(t.repeat==='none'||validDate(t.date),'重复任务必须有计划日期');
}
function checkRefs(d,t,old){
 const l=d.lists.find(l=>l.id===t.listId);
 check(l&&(!t.sectionId||l.sections.some(s=>s.id===t.sectionId)),'目标清单或分组不存在');
 check(listOf(t.tags,100)&&new Set(t.tags).size===t.tags.length&&t.tags.every(x=>d.tags.some(a=>a.id===x)),'标签不存在或重复');
 check(!t.parentId||pending(taskBy(d,t.parentId))||old?.parentId===t.parentId&&!!taskBy(d,t.parentId)&&!taskBy(d,t.parentId).deletedAt,'父任务不存在或不可用');
 check(listOf(t.dependsOn,100)&&new Set(t.dependsOn).size===t.dependsOn.length&&t.dependsOn.every(x=>{const a=taskBy(d,x);return a&&!a.deletedAt&&a.id!==t.id}),'前置任务不存在或重复');
}
function applyFields(d,t,fields,requestId,{creating=false,scope='occurrence'}={}){
 shape(fields,richKeys);
 const base=Object.fromEntries(Object.entries(fields).filter(([k])=>baseKeys.includes(k)));
 normalizeExternalTasks([{title:t.title,...base,date:base.date??t.date,time:base.time??t.time}]);
 let p={...base};if(own(p,'title'))p.title=p.title.trim();
 if(own(p,'listId')&&p.listId!==t.listId&&!own(fields,'sectionId'))p.sectionId=null;
 for(const k of [...ruleKeys,'sectionId','tags','parentId','dependsOn','planMinutes','planLocked'])if(own(fields,k))p[k]=fields[k];
 if(own(p,'sectionId'))check(p.sectionId===null||string(p.sectionId,256),'分组无效');
 if(own(p,'parentId'))check(p.parentId===null||string(p.parentId,256),'父任务无效');
 if(own(p,'planMinutes'))check(p.planMinutes===null||integer(p.planMinutes,1,1440),'规划时长无效');
 if(own(p,'planLocked'))check(typeof p.planLocked==='boolean','锁定值无效');
 if(own(fields,'blocks')){
  check(!['date','time','planMinutes'].some(k=>own(fields,k)),'blocks 与日期/时间/规划时长不能混用');
  const rows=blockRows(fields.blocks,requestId),[main,...extra]=rows;
  Object.assign(p,{date:main.date,time:main.time,planMinutes:main.minutes,planSegments:extra});
  if(creating&&!own(fields,'duration'))p.duration=main.minutes;
 }
 if(own(fields,'checklist')){
  check(listOf(fields.checklist,100),'检查清单过长');
  if(creating){check(fields.checklist.every(x=>string(x,500)),'检查项无效');p.checklist=fields.checklist.map((text,i)=>({id:requestId+':check:'+i,text:text.trim(),done:false}));}
  else{check(fields.checklist.every(x=>{shape(x,['id','text','done']);return string(x.id,256)&&string(x.text,500)&&typeof x.done==='boolean'})&&new Set(fields.checklist.map(x=>x.id)).size===fields.checklist.length,'检查项无效');p.checklist=fields.checklist;}
 }
 if(own(fields,'reminders')||own(fields,'reminderOffsets')){
  check(!own(fields,'reminderAt')&&!(own(fields,'reminders')&&own(fields,'reminderOffsets')),'请选择一种提醒输入方式');
  let rows=fields.reminders;
  if(own(fields,'reminderOffsets')){
   check(listOf(fields.reminderOffsets,21)&&fields.reminderOffsets.every(x=>integer(x,0,525600)),'提前提醒分钟无效');
   rows=fields.reminderOffsets.map(x=>reminderBefore(p.date??t.date,p.time??t.time,x));
  }
  check(listOf(rows,21)&&rows.every(stamp)&&new Set(rows).size===rows.length,'提醒无效或重复');
  const oldByAt=new Map((t.extraReminders||[]).map(r=>[r.at,r]));if(t.reminderAt)oldByAt.set(t.reminderAt,{at:t.reminderAt,sentAt:t.remindedAt});
  p.reminderAt=rows[0]||'';p.remindedAt=oldByAt.get(p.reminderAt)?.sentAt??null;p.extraReminders=rows.slice(1).map((at,i)=>({id:oldByAt.get(at)?.id||requestId+':reminder:'+i,at,sentAt:oldByAt.get(at)?.sentAt??null}));
 }
 if(own(p,'reminderAt')&&p.reminderAt!==t.reminderAt&&!own(p,'remindedAt'))p.remindedAt=null;
 const target={...t,...p};
 if(own(p,'repeat')&&p.repeat==='none'&&!creating&&t.seriesId)check(scope==='series','停止重复须明确系列范围');
 check(!target.time||validDate(target.date)&&uniqueWallInstant(target.date,target.time)!==null,'计划时间必须有唯一有效日期');
 if(target.reminderAt)check(stamp(target.reminderAt),'提醒时间无效');
 validateRules(target);
 if(!creating&&(t.repeat!=='none'||t.seriesId||t.previousId)){
  check(!ruleKeys.some(k=>own(p,k))||scope==='series','修改重复规则须明确 scope=series');
  check(scope!=='series'||Object.keys(p).every(k=>ruleKeys.includes(k)),'系列修改只允许重复规则，请另行修改本次属性');
  check(!seriesSafetyKeys(d.tasks).has(series(t)),'系列暂停或存在冲突');
 }
 const change=scheduleChanges(t,t,{...scheduleSnapshot(t),...p},{locked:seriesSafetyKeys(d.tasks).has(series(t))});
 check(!change.error,change.error||'任务安排无效');
 Object.assign(p,change.fields);
 const locking=p.planLocked===true;const checked=blockPatch(t,locking?{...p,planLocked:false}:p);check(checked,'时间块已锁定或时间无效');if(locking){checked.planLocked=true;checked.planMinutes=blockMinutes({...t,...checked});}
 const out={...t,...checked};checkRefs(d,out,creating?null:t);
 return out;
}
function checkedState(d,next,ids,allowConflict,planning){
 check(next!==d,'操作未改变数据或不符合现有规则');
 migrateState(next); // Existing graph, schema and field validation; never persist a normalized replacement.
 if(planning&&!allowConflict){
  const c=taskConflicts([...next.tasks,...calendarBusy(next.calendarEvents||[])]);
  check(!ids.some(id=>c.has(id)),'规划时间冲突；请先查询日程或显式允许冲突');
 }
 return next;
}
const scheduleFields=['date','time','duration','planMinutes','blocks'];
function createTasks(d,rows,requestId,now){
 check(listOf(rows,50)&&rows.length,'每批须为1–50项');
 const tasks=[];let n=0;
 const add=(r,parent=null)=>{
  shape(r,[...richKeys,'children']);check(!parent||!own(r,'children'),'仅支持一层子任务批量输入');
  const {children,...fields}=r;if(parent){check(!own(fields,'parentId'),'子任务父项由父任务确定');fields.parentId=parent.id;fields.listId??=parent.listId;fields.sectionId??=parent.sectionId;}
  check(++n<=50,'含子任务最多50项');
  const id=requestId+':'+n;
  // Use the existing base creation contract, with schedule fields validated below.
  const b=Object.fromEntries(Object.entries(fields).filter(([k])=>baseKeys.includes(k)));
  const t={...prepareExternalTasks(d,{id:requestId,tasks:[b]},now)[0],id};
  const out=applyFields({...d,tasks:[...d.tasks,...tasks]},t,fields,id,{creating:true});
  tasks.push(out);
  if(children!==undefined){check(listOf(children,50),'子任务无效');for(const child of children)add(child,out)}
 };
 for(const r of rows)add(r);
 return tasks;
}
export async function prepareCliOperation(d,request,requestId,now=new Date(),context={}){
 check(obj(request)&&typeof request.op==='string','操作契约无效');
 const today=dayKey(now),op=request.op;
 if(HISTORY_OPS.includes(op))return prepareHistory(d,request,requestId,now,context);
 if(MANAGEMENT_OPS.includes(op))return prepareManagement(d,request,requestId,now,{...context,base:prepareCliOperation});
 let next=d,result={};
 const get=async({id,version:v,scope='occurrence'},allowDeleted=false)=>{
  const t=taskBy(d,id);check(t&&(allowDeleted||!t.deletedAt),'任务不存在');await expectVersion(t,v);
  check(['occurrence','series'].includes(scope),'修改范围无效');return t;
 };
 if(op==='create'){
  shape(request,['op','tasks','allowConflict']);check(request.allowConflict===undefined||typeof request.allowConflict==='boolean','冲突选项无效');
  const tasks=createTasks(d,request.tasks,requestId,now);
  next=checkedState(d,appendCapture(d,tasks),tasks.map(t=>t.id),request.allowConflict,tasks.some(t=>t.date&&t.time||t.planSegments?.length));result={task_ids:tasks.map(t=>t.id),task_count:tasks.length,...(tasks.some(t=>t.repeat!=='none'&&t.planSegments?.length)?{warning:'现有重复引擎仅为当前实例保留补充时间段；后续实例使用预计时长，不复制补充时间段'}:{})};
 }else if(op==='query'){
  shape(request,['op','view','q','listId','tagId','offset','limit']);
  const {view='all',q='',listId,tagId,offset=0,limit=20}=request;
  check(['today','upcoming','overdue','all','someday','recurring','completed','skipped','trash'].includes(view)&&typeof q==='string'&&q.length<=500&&integer(offset,0,100000)&&integer(limit,1,50),'查询范围无效');
  check(!listId||d.lists.some(l=>l.id===listId),'清单不存在');check(!tagId||d.tags.some(t=>t.id===tagId),'标签不存在');
  const needle=q.trim().toLowerCase(),rows=d.tasks.filter(t=>matches(t,view,today)&&(!listId||t.listId===listId)&&(!tagId||t.tags.includes(tagId))&&(!needle||[t.title,t.notes,...t.tags.map(id=>d.tags.find(a=>a.id===id)?.name||'')].some(v=>v.toLowerCase().includes(needle))));
  result={total:rows.length,offset,limit,tasks:await Promise.all(rows.slice(offset,offset+limit).map(t=>itemView(t)))};
 }else if(op==='show'){
  shape(request,['op','id','includeDeleted']);const t=taskBy(d,request.id);check(t&&(!t.deletedAt||request.includeDeleted===true),'任务不存在');result={task:await itemView(t,true)};
 }else if(op==='catalog'){
  shape(request,['op']);result={lists:await Promise.all(d.lists.map(async l=>({id:l.id,name:l.name,version:await version(l),sections:await Promise.all(l.sections.map(async s=>({id:s.id,name:s.name,version:await version(s)})))}))),tags:await Promise.all(d.tags.map(async t=>({id:t.id,name:t.name,version:await version(t)}))),habits:await Promise.all(d.habits.map(async h=>({id:h.id,name:h.name,checked:h.days.includes(today),version:await version(h)}))),timer:d.timer,timerVersion:await version(d.timer)};
 }else if(op==='calendar'){
  shape(request,['op','from','to']);const {from=today,to=from}=request;
  check(validDate(from)&&validDate(to)&&to>=from&&to<=shiftDay(from,30),'日历范围最多31天');
  const a=+new Date(from+'T00:00:00'),b=+new Date(shiftDay(to,1)+'T00:00:00'),all=[...d.tasks,...calendarBusy(d.calendarEvents||[])],conflict=taskConflicts(all);
  const rows=expandPlanBlocks(all).filter(t=>pending(t)&&t.date&&t.time).flatMap(t=>{const [start,end]=blockInterval(t);return Number.isFinite(start)&&Number.isFinite(end)&&end>a&&start<b?[{id:t.ownerId||t.id,segmentId:t.segmentId||null,title:t.title,date:t.date,time:t.time,minutes:blockMinutes(t),start:new Date(start).toISOString(),end:new Date(end).toISOString(),conflict:conflict.has(t.id),external:!!t.external}]:[]}).sort((a,b)=>a.start.localeCompare(b.start));
  check(rows.length<=500,'日历结果过多，请缩小日期范围');result={from,to,blocks:rows};
 }else if(op==='stats'){
  shape(request,['op','date','period']);const period=request.period??'day',date=request.date??today;
  check(['day','week','month'].includes(period)&&validDate(date)&&date<=today,'回顾日期无效');
  const r=buildReview(d,reviewPeriod(date,today,period==='month'?'month':period==='week'));
  result={since:r.since,until:r.until,completed:r.completed.length,planned:r.planned.length,outstanding:r.outstanding.length,overdue:r.overdue.length,plannedMinutes:r.plannedMinutes,focusMinutes:r.focusMinutes,habitCount:r.habitCount,points:r.points,conflictCount:r.conflictCount};
 }else if(op==='update'){
  shape(request,['op','id','version','scope','fields','allowConflict']);check(request.allowConflict===undefined||typeof request.allowConflict==='boolean','冲突选项无效');
  const t=await get(request);check(pending(t),'仅可编辑待办');
  const scope=request.scope??'occurrence';check(obj(request.fields)&&Object.keys(request.fields).length,'无变更字段');
  if(scope==='series')check(ruleKeys.every(k=>!own(request.fields,k)||t.repeat!=='none')&&Object.keys(request.fields).every(k=>ruleKeys.includes(k)),'系列操作仅修改已有重复规则');
  const changed=applyFields(d,t,request.fields,requestId,{scope});
  let tasks=d.tasks;if(scope==='series')tasks=seriesPatch(tasks,t.id,Object.fromEntries(ruleKeys.filter(k=>!sameRecord(changed[k],t[k])).map(k=>[k,changed[k]])));
  tasks=tasks.map(x=>x.id===t.id?changed:x);
  check(!sameRecord(changed,t),'没有实际变更');
  next=checkedState(d,{...d,tasks},[t.id],request.allowConflict,scheduleFields.some(k=>own(request.fields,k)));
  result={task_id:t.id};
 }else if(['complete','reopen','restore','move','postpone','series','undo-completion'].includes(op)){
  const extra={complete:[],reopen:['confirmSeries'],restore:[],move:['listId','sectionId'],postpone:['days','allowConflict'],series:['action'], 'undo-completion':['completedAt','stage']}[op];
  shape(request,['op','id','version','scope',...extra]);const t=await get(request,op==='restore');
  if(op!=='series')check(request.scope===undefined||request.scope==='occurrence','此操作仅支持当前实例');
  if(op==='complete')next={...d,tasks:completeTask(d.tasks,t.id,today)};
  if(op==='reopen'){check(t.repeat==='none'||request.confirmSeries===true,'恢复历史重复实例须明确确认');next={...d,tasks:reopenTask(d.tasks,t.id)}}
  if(op==='restore'){check(t.deletedAt,'任务不在回收站');next={...d,tasks:d.tasks.map(x=>x===t?{...x,deletedAt:null}:x)}}
  if(op==='move')next=moveTaskToList(d,t.id,request.listId,request.sectionId??null);
  if(op==='postpone'){
   const preview=previewPostpone(d.tasks,[t.id],request.days);check(preview.rows.length===1,'仅支持现有普通待办延期1/3/7天');check(!preview.conflicts||request.allowConflict===true,'延期冲突');next={...d,tasks:applyPostpone(d.tasks,preview,request.days)};
  }
  if(op==='series'){check(request.scope==='series'&&['pause','resume','end'].includes(request.action),'明确指定系列操作范围');next={...d,tasks:seriesControl(d.tasks,t.id,request.action)}}
  if(op==='undo-completion'){check(['todo','doing'].includes(request.stage),'原状态无效');next={...d,tasks:undoOrdinaryCompletion(d.tasks,{id:t.id,completedAt:request.completedAt,stage:request.stage})}}
  check(next.tasks!==d.tasks,'操作受现有领域规则限制');next=checkedState(d,next,[t.id],false,false);
  result={task_id:t.id,...(op==='complete'&&t.repeat==='none'&&!t.seriesId&&!t.previousId?{undo:{completedAt:taskBy(next,t.id).completedAt,stage:t.stage}}:{})};
 }else if(op==='entity-create'||op==='entity-rename'){
  shape(request,['op','kind','id','version','parentId','name','color']);
  const {kind,parentId,name,color='#778396'}=request;
  check(['list','tag','section'].includes(kind)&&string(name,100)&&/^#[0-9a-fA-F]{6}$/.test(color),'分类参数无效');
  const parent=kind==='section'?d.lists.find(l=>l.id===parentId):null;check(kind!=='section'||parent,'目标清单不存在');
  const key=kind==='tag'?'tags':'lists',rows=kind==='section'?parent.sections:d[key];
  const old=op==='entity-rename'?rows.find(r=>r.id===request.id):null;
  if(op==='entity-rename'){check(old,'分类不存在');await expectVersion(old,request.version)}
  check(!rows.some(r=>r!==old&&r.name===name.trim()),'分类名称重复');
  const item={...old,id:old?.id||requestId,name:name.trim(),color:own(request,'color')||!old?color:old.color,...(kind==='list'&&!old?{folderId:null,sections:[],icon:''}:{})};
  next=saveOrganizationEntity(d,{kind,existing:old,entity:item,parent:kind==='section'?parent.id:old?.folderId,icon:old?.icon});migrateState(next);
  const saved=kind==='section'?next.lists.find(l=>l.id===parent.id).sections.find(x=>x.id===item.id):next[key].find(x=>x.id===item.id);
  result={id:item.id,version:await version(saved)};
 }else if(op==='habit-create'){
  shape(request,['op','name','weeklyGoal']);check(string(request.name,100)&&integer(request.weeklyGoal??7,1,7),'习惯名称或每周目标无效');
  check(!d.habits.some(h=>h.name===request.name.trim()),'习惯名称重复');next=appendHabit(d,{id:requestId,name:request.name,weeklyGoal:request.weeklyGoal??7});check(next!==d,'不能创建习惯');result={id:requestId,version:await version(next.habits.at(-1))};
 }else if(op==='habit-check'){
  shape(request,['op','id','version','date','checked']);const h=d.habits.find(x=>x.id===request.id),date=request.date??today;
  check(h&&validDate(date)&&date<=today&&typeof request.checked==='boolean','习惯打卡参数无效');await expectVersion(h,request.version);
  next=setHabitChecked(d,h.id,date,request.checked);result={id:h.id,date,checked:request.checked};
 }else if(op==='focus-start'||op==='focus-change'){
  shape(request,op==='focus-start'?['op','version','mode','minutes','taskId','planned']:['op','version','action']);
  await expectVersion(d.timer,request.version);
  if(op==='focus-start'){check(request.planned===undefined||typeof request.planned==='boolean','规划参数无效');next=startFocusTimer(d,{mode:request.mode??'focus',minutes:request.minutes??d.focusConfig.focus,taskId:request.taskId??null,planned:request.planned===true,now:+now})}
  else{check(['pause','resume','save'].includes(request.action),'专注操作无效（不开放丢弃记录）');next=changeFocusTimer(d,{action:request.action,key:focusTimerKey(d.timer),now:+now})}
  check(next!==d,'计时器状态不允许操作');result={timer:next.timer,timerVersion:await version(next.timer)};
 }else fail('未知操作');
 return {next,result};
}
