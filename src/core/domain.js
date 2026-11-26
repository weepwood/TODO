import {validImportRuns} from './import-receipt-validation.js';
import {validHabitSchedule,validHabitVersions} from './habit-plan.js';
import {validQueueRun,validQueueHistory} from './focus-queue.js';
import {validBlock} from './plan-block.js';
import {validDeadline,repeatDeadline} from './deadline.js';
import {planningConfig,PLAN_STRATEGIES} from './pomodoro-planner.js';
import {validActivity} from './task-activity.js';
import {validPreferenceProfile} from './preference-sync.js';
import {validRun} from './workflow-rules.js';
import {validHold,seriesSafetyKeys} from './series-control.js';
import {validPoints} from './points.js';
import {validPointsProgram} from './points-program.js';
import {validSmartLists} from './smart-lists.js';
import {nextWeekday,offsetDate,blockers,canLink} from './advanced.js';
export const STORAGE_KEY='todo-workbench-v1';
export const BACKUP_KEY='todo-workbench-backup';
export const id=()=>globalThis.crypto.randomUUID();
export const dayKey=(date=new Date())=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
export function shiftDay(key,days){const [y,m,d]=key.split('-').map(Number);const date=new Date(y,m-1,d,12);date.setDate(date.getDate()+days);return dayKey(date)}
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&s.slice(0,4)>='1900'&&s.slice(0,4)<='9998'&&dayKey(new Date(s+'T12:00:00'))===s}
export const validTime=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const intervalOf=n=>Math.max(1,Math.min(365,Math.trunc(Number(n)||1)));
export function effectiveDay(now=new Date(),reset='00:00'){const [h,m]=reset.split(':').map(Number);return shiftDay(dayKey(now),now.getHours()*60+now.getMinutes()<h*60+m?-1:0)}
export function nextDate(key,repeat,anchor=Number(key.slice(-2)),interval=1){
 const n=intervalOf(interval);
 if(repeat==='daily'||repeat==='completion')return shiftDay(key,n);
 if(repeat==='weekly')return shiftDay(key,n*7);
 if(repeat==='monthly'){const [y,m]=key.split('-').map(Number);const next=new Date(y,m-1+n,1,12);next.setDate(Math.min(anchor,new Date(next.getFullYear(),next.getMonth()+1,0,12).getDate()));return dayKey(next)}
 return null
}
export function initialState(){return {version:2,theme:'system',folders:[],lists:[{id:'inbox',name:'收集箱',color:'#778396',folderId:null,sections:[]},{id:'work',name:'工作',color:'#6784da',folderId:null,sections:[]},{id:'personal',name:'个人',color:'#47a58d',folderId:null,sections:[]}],tags:[],tasks:[],templates:[],habits:[],sessions:[],timer:null,notifications:[],calendarEvents:[],focusConfig:{focus:25,break:5,longBreak:15,cycles:4,autoContinue:false,ignoreShortSessions:true,smartPlan:true,deductFocus:true,planStrategy:"merge",planAutoContinue:false}}}
export function newTask(title,listId='inbox',date='',taskId=id()){return {id:taskId,title:title.trim(),notes:'',listId,sectionId:null,tags:[],date,time:'',duration:30,reminderAt:'',remindedAt:null,priority:0,stage:'todo',repeat:'none',interval:1,miss:'keep',reset:'00:00',anchor:date?Number(date.slice(-2)):null,seriesId:null,previousId:null,checklist:[],status:'pending',deletedAt:null,createdAt:new Date().toISOString(),completedAt:null,weekdays:[],seriesStart:date||'',occurrenceIndex:1,repeatUntil:'',repeatCount:0,extraReminders:[],parentId:null,dependsOn:[]}}
const series=t=>t.seriesId||t.id;
export function nextOccurrence(task,key){
 if(task.repeat==='workdays')return nextWeekday(key,[1,2,3,4,5],1,task.seriesStart||task.date);
 if(task.repeat==='weekdays')return nextWeekday(key,task.weekdays?.length?task.weekdays:[new Date(key+'T12:00:00').getDay()],task.interval||1,task.seriesStart||task.date);
 return nextDate(key,task.repeat,task.anchor||Number(task.date.slice(-2)),task.interval)
}
export function addOccurrence(tasks,task,date,index=(task.occurrenceIndex||1)+1){
 if(task.seriesHold||!validDate(date)||(task.repeatUntil&&date>task.repeatUntil)||(task.repeatCount>0&&index>task.repeatCount)||tasks.some(t=>series(t)===series(task)&&t.date===date&&(task.repeat!=='completion'||t.status==='pending'||t.previousId===task.id)))return tasks;
 const {activity,...content}=task;
 return [...tasks,{...content,id:id(),seriesId:series(task),seriesStart:task.seriesStart||task.date,occurrenceIndex:index,previousId:task.id,date,...(task.planLocked!==undefined?{planLocked:false}:{}),...(task.planMinutes!==undefined?{planMinutes:null}:{}),...(task.planSegments!==undefined?{planSegments:[]}:{}),...(task.deadline!==undefined?{deadline:repeatDeadline(task,date)}:{}),status:'pending',stage:'todo',deletedAt:null,createdAt:new Date().toISOString(),completedAt:null,remindedAt:null,reminderAt:offsetDate(task.reminderAt,task.date,date),extraReminders:(task.extraReminders||[]).map(r=>({id:id(),at:offsetDate(r.at,task.date,date),sentAt:null})),checklist:task.checklist.map(c=>({...c,id:id(),done:false}))}]
}
// Fast-forward fixed daily/weekly series without iterating over years of missed dates.
export function advanceOccurrence(task,next,index,boundary){
 if(!validDate(next)||next>=boundary)return {next,index};
 if(['daily','weekly'].includes(task.repeat)){
  const step=intervalOf(task.interval)*(task.repeat==='weekly'?7:1);
  const days=Math.round((Date.parse(boundary+'T00:00:00Z')-Date.parse(next+'T00:00:00Z'))/86400000);
  const jumps=Math.ceil(days/step);return {next:shiftDay(next,jumps*step),index:index+jumps};
 }
 while(validDate(next)&&next<boundary){
  if((task.repeatUntil&&next>task.repeatUntil)||(task.repeatCount>0&&index>task.repeatCount))return {next,index};
  next=nextOccurrence(task,next);index++;
 }
 return {next,index};
}
export function completeTask(tasks,taskId,today=dayKey()){
 const task=tasks.find(t=>t.id===taskId);
 if(!task||task.status!=='pending'||task.deletedAt||seriesSafetyKeys(tasks).has(series(task))||blockers(tasks,task).length)return tasks;
 let result=tasks.map(t=>t.id===taskId?{...t,status:'completed',completedAt:new Date().toISOString(),stage:'done'}:t);
 if(task.repeat==='none'||!task.date)return result;
 let next=nextOccurrence(task,task.repeat==='completion'?today:task.date),index=(task.occurrenceIndex||1)+1;
 if(task.miss==='skip')({next,index}=advanceOccurrence(task,next,index,today));
 return addOccurrence(result,task,next,index)
}
export function reconcile(tasks,today=dayKey(),now=null){
 let result=tasks;const held=seriesSafetyKeys(tasks);
 for(const task of tasks){
  if(task.deletedAt||task.status!=='pending'||held.has(series(task))||!['daily','weekly','monthly','workdays','weekdays'].includes(task.repeat)||task.miss!=='skip'||!validDate(task.date))continue;
  const boundary=now?effectiveDay(now,task.reset||'00:00'):today;if(task.date>=boundary)continue;
  const {next,index}=advanceOccurrence(task,task.date,task.occurrenceIndex||1,boundary);
  result=result.map(t=>t.id===task.id?{...t,status:'skipped'}:t);
  result=addOccurrence(result,task,next,index)
 }
 return result
}
export function seriesPatch(tasks,taskId,fields){const task=tasks.find(t=>t.id===taskId);if(!task||seriesSafetyKeys(tasks).has(series(task)))return tasks;const allowed=['repeat','seriesStart','interval','weekdays','repeatUntil','repeatCount','miss','reset'];const rules=Object.fromEntries(Object.entries(fields).filter(([k])=>allowed.includes(k)));return tasks.map(t=>series(t)===series(task)&&t.status==='pending'&&!t.deletedAt&&!t.seriesHold?{...t,...rules}:t)}
export function dueReminderEvents(tasks,now=new Date()){
 const events=[];for(const t of tasks){if(t.deletedAt||t.status!=='pending')continue;if(t.reminderAt&&!t.remindedAt&&new Date(t.reminderAt)<=now)events.push({taskId:t.id,id:'primary',at:t.reminderAt,title:t.title});for(const r of t.extraReminders||[])if(!r.sentAt&&new Date(r.at)<=now)events.push({taskId:t.id,id:r.id,at:r.at,title:t.title})}return events
}
export function markReminderEvents(tasks,events,at){const grouped=new Map();for(const e of events){if(!grouped.has(e.taskId))grouped.set(e.taskId,new Set());grouped.get(e.taskId).add(e.id)}return tasks.map(t=>{const ids=grouped.get(t.id);if(!ids)return t;return {...t,remindedAt:ids.has('primary')?at:t.remindedAt,extraReminders:(t.extraReminders||[]).map(r=>ids.has(r.id)?{...r,sentAt:at}:r)}})}
// Do not rewrite historical recurring chains; reopening is allowed only when there is no live later instance.
export function reopenTask(tasks,taskId){
 const t=tasks.find(x=>x.id===taskId);
 if(!t||t.deletedAt||t.status==='pending')return tasks;
 if(tasks.some(x=>series(x)===series(t)&&x.id!==t.id&&!x.deletedAt&&(x.date>t.date||x.previousId===t.id||(x.occurrenceIndex||1)>(t.occurrenceIndex||1))))return tasks;
 return tasks.map(x=>x.id===taskId?{...x,status:'pending',stage:'todo',completedAt:null,repeat:'none',...(x.seriesHold?{seriesHold:null}:{})}:x)
}
export function matches(t,view,today=dayKey()){
 if(view==='trash')return !!t.deletedAt;
 if(t.deletedAt)return false;
 if(view==='completed')return t.status==='completed';
 if(view==='skipped')return t.status==='skipped';
 if(view.startsWith('tag:'))return t.status==='pending'&&t.tags?.includes(view.slice(4));
 if(t.status!=='pending')return false;
 if(view==='today')return !!t.date&&t.date<=today;
 if(view==='upcoming')return t.date>today&&t.date<=shiftDay(today,7);
 if(view==='all')return true;
 if(view==='overdue')return !!t.date&&t.date<today;
 if(view==='recurring')return t.repeat!=='none';
 if(view==='someday')return !t.date;
 return t.listId===view
}
const str=x=>typeof x==='string';
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const unique=items=>new Set(items.map(x=>x.id)).size===items.length;
function check(condition,message){if(!condition)throw new Error(message)}
function records(a,name){check(Array.isArray(a)&&a.length<=100000&&a.every(x=>obj(x)&&str(x.id)&&x.id.length>0)&&unique(a),name+' 数据无效');return a}
export function migrateState(input){
 check(obj(input)&&[1,2].includes(input.version),'不支持的数据版本');
 const base=initialState(),v={...base,...input,version:2};
 if(v.queueHistory!==undefined)check(validQueueHistory(v.queueHistory),'连续会话历史无效');
 if(v.importRuns!==undefined)check(validImportRuns(v.importRuns),'导入事务记录无效');
 if(v.pointsProgram!==undefined)check(validPointsProgram(v.pointsProgram),'积分目标或兑换数据无效');
 if(v.preferenceProfile!==undefined)check(validPreferenceProfile(v.preferenceProfile),'同步偏好数据无效');
 if(v.workflowRuns!==undefined)check(Array.isArray(v.workflowRuns)&&v.workflowRuns.length<=30&&v.workflowRuns.every(validRun)&&unique(v.workflowRuns),'自动化执行记录无效');
 if(v.smartLists!==undefined)check(validSmartLists(v.smartLists),'智能清单数据无效');
 v.folders=records(v.folders,'文件夹');v.tags=records(v.tags,'标签');v.lists=records(v.lists,'清单');
 for(const item of [...v.folders,...v.tags,...v.lists])check(str(item.name)&&item.name.trim(),'分类名称无效');
 check(v.lists.some(l=>l.id==='inbox'),'缺少收集箱');
 v.lists=v.lists.map(l=>({...l,folderId:v.folders.some(f=>f.id===l.folderId)?l.folderId:null,sections:records(l.sections??[],'分组')}));
 for(const l of v.lists)for(const s of l.sections)check(str(s.name)&&s.name.trim(),'分组名称无效');
 v.tasks=records(v.tasks,'任务').map(t=>{
  check(str(t.title)&&str(t.notes)&&str(t.createdAt)&&['pending','completed','skipped'].includes(t.status)&&(!t.date||validDate(t.date))&&['none','daily','weekly','monthly','completion','workdays','weekdays'].includes(t.repeat)&&['keep','skip'].includes(t.miss)&&Number.isInteger(t.priority)&&t.priority>=0&&t.priority<=3,'任务字段无效');
  check(Array.isArray(t.checklist)&&t.checklist.every(c=>obj(c)&&str(c.id)&&str(c.text)&&typeof c.done==='boolean')&&unique(t.checklist),'检查项无效');
  const list=v.lists.find(l=>l.id===t.listId)||v.lists.find(l=>l.id==='inbox');
  const n={...newTask(t.title,list.id,t.date||'',t.id),...t,listId:list.id,sectionId:list.sections.some(s=>s.id===t.sectionId)?t.sectionId:null};
  check(Array.isArray(n.tags)&&n.tags.every(str)&&validTime(n.reset)&&(!n.time||validTime(n.time))&&Number.isFinite(n.duration)&&n.duration>=1&&n.duration<=1440&&['todo','doing','done'].includes(n.stage)&&(!n.reminderAt||/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(n.reminderAt)&&validDate(n.reminderAt.slice(0,10))&&validTime(n.reminderAt.slice(11))),'任务时间或扩展字段无效');
  check(validBlock(n),'规划占位无效');
  check(validDeadline(n.deadline),'任务截止时间无效');
  check(n.points===undefined||validPoints(n.points),'任务积分无效');check(n.anchor===null||Number.isInteger(n.anchor)&&n.anchor>=1&&n.anchor<=31,'重复日期锚点无效');check(n.deletedAt===null||str(n.deletedAt),'回收站状态无效');check(n.seriesId===null||str(n.seriesId),'系列标识无效');check(Array.isArray(n.weekdays)&&n.weekdays.every(x=>Number.isInteger(x)&&x>=0&&x<=6)&&(!n.repeatUntil||validDate(n.repeatUntil))&&(!n.seriesStart||validDate(n.seriesStart))&&Number.isInteger(n.repeatCount)&&n.repeatCount>=0&&n.repeatCount<=100000&&Number.isInteger(n.occurrenceIndex)&&n.occurrenceIndex>=1,'扩展周期无效');
  check((n.parentId===null||str(n.parentId))&&Array.isArray(n.dependsOn)&&n.dependsOn.every(str)&&Array.isArray(n.extraReminders)&&n.extraReminders.length<=20&&unique(n.extraReminders)&&n.extraReminders.every(r=>obj(r)&&str(r.id)&&str(r.at)&&validDate(r.at.slice(0,10))&&validTime(r.at.slice(11))&&(r.sentAt===null||str(r.sentAt))),'扩展任务字段无效');
  if(n.activity!==undefined){check(validActivity(n.activity),'任务活动记录无效');if(n.activity.some(e=>e.taskId!==undefined&&e.taskId!==n.id))n.activity=n.activity.filter(e=>e.taskId===undefined||e.taskId===n.id)}
  if(n.seriesHold!=null)check(validHold(n.seriesHold),'重复暂停记录无效');
  if(n.links!==undefined)check(Array.isArray(n.links)&&n.links.length<=30&&n.links.every(l=>obj(l)&&str(l.name)&&l.name.length<=100&&str(l.url)&&l.url.length<=2048&&(()=>{try{const u=new URL(l.url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password}catch{return false}})()),'关联链接无效');
  n.tags=n.tags.filter(x=>v.tags.some(tag=>tag.id===x));n.interval=intervalOf(n.interval);return n
 });
 const taskIds=new Set(v.tasks.map(t=>t.id));for(const t of v.tasks){if(t.parentId&&!taskIds.has(t.parentId))t.parentId=null;t.dependsOn=t.dependsOn.filter(x=>taskIds.has(x));}
 for(const t of v.tasks){if(t.parentId&&!canLink(v.tasks,t.id,t.parentId,'parentId'))throw Error('子任务循环');for(const dep of t.dependsOn)if(!canLink(v.tasks,t.id,dep))throw Error('任务依赖循环')}
 v.calendarEvents=records(v.calendarEvents,'日历事件');for(const e of v.calendarEvents)check(str(e.title)&&str(e.start)&&Number.isFinite(Date.parse(e.start))&&(!e.end||Number.isFinite(Date.parse(e.end))),'日历事件无效');
 check(obj(v.focusConfig)&&['focus','break','longBreak','cycles'].every(k=>Number.isFinite(v.focusConfig[k])&&v.focusConfig[k]>=1&&v.focusConfig[k]<=180),'专注设置无效');
 check(v.focusConfig.ignoreShortSessions===undefined||typeof v.focusConfig.ignoreShortSessions==='boolean','短时专注设置无效');
 for(const k of ['smartPlan','deductFocus','planAutoContinue'])check(v.focusConfig[k]===undefined||typeof v.focusConfig[k]==='boolean','番茄规划设置无效');
 check(v.focusConfig.planStrategy===undefined||PLAN_STRATEGIES.includes(v.focusConfig.planStrategy),'番茄拆分策略无效');
 v.focusConfig={...v.focusConfig,ignoreShortSessions:v.focusConfig.ignoreShortSessions!==false,...planningConfig(v.focusConfig)};
 v.templates=records(v.templates,'模板');for(const t of v.templates)check(str(t.name)&&obj(t.task)&&str(t.task.title)&&str(t.task.notes)&&(t.task.points===undefined||validPoints(t.task.points))&&Array.isArray(t.task.checklist)&&t.task.checklist.every(c=>obj(c)&&str(c.text)),'模板无效');
 v.habits=records(v.habits,'习惯');for(const h of v.habits)check(str(h.name)&&Array.isArray(h.days)&&h.days.every(validDate)&&validHabitSchedule(h.planWeekdays)&&validHabitVersions(h.planVersions)&&(h.includeInPlan===undefined||typeof h.includeInPlan==='boolean'),'习惯无效');
 v.sessions=records(v.sessions,'专注记录');for(const s of v.sessions)check(str(s.startedAt)&&Number.isFinite(s.seconds)&&s.seconds>=0&&(s.queueRunId===undefined||str(s.queueRunId)&&s.queueRunId.length<=100),'专注记录无效');
 if(v.timer!==null)check(obj(v.timer)&&['focus','stopwatch','break'].includes(v.timer.mode)&&Number.isFinite(v.timer.elapsed)&&v.timer.elapsed>=0&&Number.isFinite(v.timer.target)&&v.timer.target>=0&&(v.timer.startedAt===null||Number.isFinite(v.timer.startedAt))&&str(v.timer.createdAt),'计时器无效');
 if(v.timer!==null){check(v.timer.queueRun===undefined||validQueueRun(v.timer.queueRun),'连续专注会话无效');check(v.timer.phaseAt===undefined||str(v.timer.phaseAt)&&Number.isFinite(Date.parse(v.timer.phaseAt)),'计时阶段标识无效');check(v.timer.planned===undefined||typeof v.timer.planned==='boolean','番茄规划计时无效');check(v.timer.planBaseline===undefined||Number.isFinite(v.timer.planBaseline)&&v.timer.planBaseline>=0,'番茄规划基线无效');}
 check(Array.isArray(v.notifications)&&v.notifications.every(x=>obj(x)&&str(x.id)&&str(x.title)),'通知无效');
 check(['system','light','dark'].includes(v.theme),'主题无效');return v
}
export function readState(storage){const raw=storage.getItem(STORAGE_KEY);return raw?migrateState(JSON.parse(raw)):initialState()}
export function saveState(storage,state){const old=storage.getItem(STORAGE_KEY);const next=JSON.stringify(state);if(old===next)return;if(old&&(!storage.getItem(BACKUP_KEY)||Date.now()-Number(storage.getItem(BACKUP_KEY+'-at')||0)>=3600000)){storage.setItem(BACKUP_KEY,old);storage.setItem(BACKUP_KEY+'-at',String(Date.now()))}storage.setItem(STORAGE_KEY,next)}
export function timerSeconds(timer,now=Date.now()){return Math.max(0,timer.elapsed+(timer.startedAt===null?0:Math.floor((now-timer.startedAt)/1000)))}
export function dueReminders(tasks,now=new Date()){return tasks.filter(t=>!t.deletedAt&&t.status==='pending'&&t.reminderAt&&!t.remindedAt&&new Date(t.reminderAt)<=now)}
export function reorderTasks(tasks,active,over){const i=tasks.findIndex(t=>t.id===active),j=tasks.findIndex(t=>t.id===over);if(i<0||j<0||i===j)return tasks;const a=[...tasks];a.splice(j,0,a.splice(i,1)[0]);return a}

// Copy task content only. A new independent pending task never inherits recurrence,
// reminder delivery, dependencies, child relations or device-local attachments.
export function duplicateTask(task,lists,tags){
 if(!task||task.status!=='pending'||task.deletedAt)return null;
 const list=lists.find(l=>l.id===task.listId)||lists.find(l=>l.id==='inbox');if(!list)return null;
 return {...newTask(task.title+'（副本）',list.id,task.date),notes:task.notes,time:task.time,duration:task.duration,priority:task.priority,...(task.points!==undefined?{points:task.points}:{}),sectionId:list.sections.some(s=>s.id===task.sectionId)?task.sectionId:null,tags:task.tags.filter(id=>tags.some(t=>t.id===id)),checklist:task.checklist.map(c=>({id:id(),text:c.text,done:false})),...(task.links?{links:task.links.map(l=>({...l}))}:{})};
}
export function moveTaskToList(state,tid,listId,sectionId=null){
 const list=state.lists.find(l=>l.id===listId),task=state.tasks.find(t=>t.id===tid);
 if(!list||!task||task.deletedAt||task.status!=='pending'||(sectionId!==null&&!list.sections.some(s=>s.id===sectionId)))return state;
 if(task.listId===listId&&task.sectionId===sectionId)return state;
 return {...state,tasks:state.tasks.map(t=>t.id===tid?{...t,listId,sectionId}:t)};
}
