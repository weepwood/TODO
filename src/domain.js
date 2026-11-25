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
export function initialState(){return {version:2,theme:'system',folders:[],lists:[{id:'inbox',name:'收集箱',color:'#778396',folderId:null,sections:[]},{id:'work',name:'工作',color:'#6784da',folderId:null,sections:[]},{id:'personal',name:'个人',color:'#47a58d',folderId:null,sections:[]}],tags:[],tasks:[],templates:[],habits:[],sessions:[],timer:null,notifications:[]}}
export function newTask(title,listId='inbox',date=''){return {id:id(),title:title.trim(),notes:'',listId,sectionId:null,tags:[],date,time:'',duration:30,reminderAt:'',remindedAt:null,priority:0,stage:'todo',repeat:'none',interval:1,miss:'keep',reset:'00:00',anchor:date?Number(date.slice(-2)):null,seriesId:null,previousId:null,checklist:[],status:'pending',deletedAt:null,createdAt:new Date().toISOString(),completedAt:null}}
const series=t=>t.seriesId||t.id;
export function addOccurrence(tasks,task,date){
 if(!validDate(date)||tasks.some(t=>series(t)===series(task)&&t.date===date&&(task.repeat!=='completion'||t.status==='pending'||t.previousId===task.id)))return tasks;
 return [...tasks,{...task,id:id(),seriesId:series(task),previousId:task.id,date,status:'pending',stage:'todo',deletedAt:null,createdAt:new Date().toISOString(),completedAt:null,remindedAt:null,reminderAt:task.reminderAt?date+task.reminderAt.slice(10):'',checklist:task.checklist.map(c=>({...c,id:id(),done:false}))}]
}
export function completeTask(tasks,taskId,today=dayKey()){
 const task=tasks.find(t=>t.id===taskId);
 if(!task||task.status!=='pending'||task.deletedAt)return tasks;
 let result=tasks.map(t=>t.id===taskId?{...t,status:'completed',completedAt:new Date().toISOString(),stage:'done'}:t);
 if(task.repeat==='none'||!task.date)return result;
 let next=nextDate(task.repeat==='completion'?today:task.date,task.repeat,task.anchor||Number(task.date.slice(-2)),task.interval);
 if(task.miss==='skip')while(validDate(next)&&next<today)next=nextDate(next,task.repeat,task.anchor||Number(task.date.slice(-2)),task.interval);
 return addOccurrence(result,task,next)
}
export function reconcile(tasks,today=dayKey(),now=null){
 let result=tasks;
 for(const task of tasks){
  const boundary=now?effectiveDay(now,task.reset||'00:00'):today;
  if(task.deletedAt||task.status!=='pending'||!['daily','weekly','monthly'].includes(task.repeat)||task.miss!=='skip'||!validDate(task.date)||task.date>=boundary)continue;
  let next=task.date;
  while(validDate(next)&&next<boundary)next=nextDate(next,task.repeat,task.anchor||Number(task.date.slice(-2)),task.interval);
  result=result.map(t=>t.id===task.id?{...t,status:'skipped'}:t);
  result=addOccurrence(result,task,next)
 }
 return result
}
// Do not rewrite historical recurring chains; reopening is allowed only when there is no live later instance.
export function reopenTask(tasks,taskId){
 const t=tasks.find(x=>x.id===taskId);
 if(!t||t.deletedAt||t.status==='pending')return tasks;
 if(tasks.some(x=>series(x)===series(t)&&x.id!==t.id&&x.date>t.date&&!x.deletedAt))return tasks;
 return tasks.map(x=>x.id===taskId?{...x,status:'pending',stage:'todo',completedAt:null,repeat:'none'}:x)
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
 v.folders=records(v.folders,'文件夹');v.tags=records(v.tags,'标签');v.lists=records(v.lists,'清单');
 for(const item of [...v.folders,...v.tags,...v.lists])check(str(item.name)&&item.name.trim(),'分类名称无效');
 check(v.lists.some(l=>l.id==='inbox'),'缺少收集箱');
 v.lists=v.lists.map(l=>({...l,folderId:v.folders.some(f=>f.id===l.folderId)?l.folderId:null,sections:records(l.sections??[],'分组')}));
 for(const l of v.lists)for(const s of l.sections)check(str(s.name)&&s.name.trim(),'分组名称无效');
 v.tasks=records(v.tasks,'任务').map(t=>{
  check(str(t.title)&&str(t.notes)&&str(t.createdAt)&&['pending','completed','skipped'].includes(t.status)&&(!t.date||validDate(t.date))&&['none','daily','weekly','monthly','completion'].includes(t.repeat)&&['keep','skip'].includes(t.miss)&&Number.isInteger(t.priority)&&t.priority>=0&&t.priority<=3,'任务字段无效');
  check(Array.isArray(t.checklist)&&t.checklist.every(c=>obj(c)&&str(c.id)&&str(c.text)&&typeof c.done==='boolean')&&unique(t.checklist),'检查项无效');
  const list=v.lists.find(l=>l.id===t.listId)||v.lists.find(l=>l.id==='inbox');
  const n={...newTask(t.title,list.id,t.date||''),...t,listId:list.id,sectionId:list.sections.some(s=>s.id===t.sectionId)?t.sectionId:null};
  check(Array.isArray(n.tags)&&n.tags.every(str)&&validTime(n.reset)&&(!n.time||validTime(n.time))&&Number.isFinite(n.duration)&&n.duration>=1&&n.duration<=1440&&['todo','doing','done'].includes(n.stage)&&(!n.reminderAt||/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(n.reminderAt)&&validDate(n.reminderAt.slice(0,10))&&validTime(n.reminderAt.slice(11))),'任务时间或扩展字段无效');
  check(n.anchor===null||Number.isInteger(n.anchor)&&n.anchor>=1&&n.anchor<=31,'重复日期锚点无效');check(n.deletedAt===null||str(n.deletedAt),'回收站状态无效');check(n.seriesId===null||str(n.seriesId),'系列标识无效');n.tags=n.tags.filter(x=>v.tags.some(tag=>tag.id===x));n.interval=intervalOf(n.interval);return n
 });
 v.templates=records(v.templates,'模板');for(const t of v.templates)check(str(t.name)&&obj(t.task)&&str(t.task.title)&&str(t.task.notes)&&Array.isArray(t.task.checklist)&&t.task.checklist.every(c=>obj(c)&&str(c.text)),'模板无效');
 v.habits=records(v.habits,'习惯');for(const h of v.habits)check(str(h.name)&&Array.isArray(h.days)&&h.days.every(validDate),'习惯无效');
 v.sessions=records(v.sessions,'专注记录');for(const s of v.sessions)check(str(s.startedAt)&&Number.isFinite(s.seconds)&&s.seconds>=0,'专注记录无效');
 if(v.timer!==null)check(obj(v.timer)&&['focus','stopwatch','break'].includes(v.timer.mode)&&Number.isFinite(v.timer.elapsed)&&v.timer.elapsed>=0&&Number.isFinite(v.timer.target)&&v.timer.target>=0&&(v.timer.startedAt===null||Number.isFinite(v.timer.startedAt))&&str(v.timer.createdAt),'计时器无效');
 check(Array.isArray(v.notifications)&&v.notifications.every(x=>obj(x)&&str(x.id)&&str(x.title)),'通知无效');
 check(['system','light','dark'].includes(v.theme),'主题无效');return v
}
export function readState(storage){const raw=storage.getItem(STORAGE_KEY);return raw?migrateState(JSON.parse(raw)):initialState()}
export function saveState(storage,state){const old=storage.getItem(STORAGE_KEY);const next=JSON.stringify(state);if(old===next)return;if(old&&(!storage.getItem(BACKUP_KEY)||Date.now()-Number(storage.getItem(BACKUP_KEY+'-at')||0)>=3600000)){storage.setItem(BACKUP_KEY,old);storage.setItem(BACKUP_KEY+'-at',String(Date.now()))}storage.setItem(STORAGE_KEY,next)}
export function timerSeconds(timer,now=Date.now()){return Math.max(0,timer.elapsed+(timer.startedAt===null?0:Math.floor((now-timer.startedAt)/1000)))}
export function dueReminders(tasks,now=new Date()){return tasks.filter(t=>!t.deletedAt&&t.status==='pending'&&t.reminderAt&&!t.remindedAt&&new Date(t.reminderAt)<=now)}
export function reorderTasks(tasks,active,over){const i=tasks.findIndex(t=>t.id===active),j=tasks.findIndex(t=>t.id===over);if(i<0||j<0||i===j)return tasks;const a=[...tasks];a.splice(j,0,a.splice(i,1)[0]);return a}
