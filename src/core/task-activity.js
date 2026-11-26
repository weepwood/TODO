// Bounded task-owned activity metadata. Never store note bodies, URLs or file names.
// IDs and timestamps are supplied by the caller, not generated inside a reducer.
export const ACTIVITY_LIMIT=300;
export const ACTIVITY_BYTES=192*1024;
const bytes=a=>new TextEncoder().encode(JSON.stringify(a)).length;
const SOURCES=['manual','bulk','automation','system','undo','redo','device','legacy'];
const CATEGORIES=['lifecycle','property','schedule','content','relation','focus'];
const str=(v,n)=>typeof v==='string'&&v.length<=n;
const stamp=v=>str(v,40)&&Number.isFinite(Date.parse(v));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const short=v=>String(v??'未设置').slice(0,160);
const fields=[
 ['title','修改任务名称','property'],['priority','修改优先级','property'],['stage','修改状态','property'],['listId','移动清单','property'],['sectionId','修改分组','property'],
 ['date','调整计划日期','schedule'],['time','调整计划时间','schedule'],['duration','修改预计时长','schedule'],['points','修改任务积分','property'],['reminderAt','修改提醒','schedule'],['extraReminders','修改额外提醒','schedule'],
 ['repeat','修改重复规则','schedule'],['interval','修改重复间隔','schedule'],['weekdays','修改重复星期','schedule'],['repeatUntil','修改重复截止','schedule'],['repeatCount','修改重复次数','schedule'],['miss','修改过期处理','schedule'],['reset','修改重置时间','schedule'],['seriesHold','修改系列暂停状态','schedule'],
 ['tags','修改标签','content'],['notes','修改备注','content'],['checklist','修改检查清单','content'],['links','修改关联链接','content'],['parentId','修改父任务','relation'],['dependsOn','修改前置任务','relation']
];
const names={none:'不重复',daily:'每天',weekly:'每周',monthly:'每月',workdays:'工作日',weekdays:'指定星期',completion:'完成后按天',todo:'待处理',doing:'进行中',done:'已完成',keep:'保留',skip:'跳过'};
const norm=(k,v)=>k==='points'?(v||0):k==='extraReminders'?(v||[]).map(r=>({id:r.id,at:r.at})):['tags','dependsOn','links','checklist','weekdays'].includes(k)?v||[]:v??'';
function describe(k,v,state,task){
 if(k==='priority')return ['无优先级','低优先级','中优先级','高优先级'][v]||'未设置';
 if(k==='listId')return short(state.lists.find(l=>l.id===v)?.name||v);
 if(k==='sectionId')return short(state.lists.find(l=>l.id===task.listId)?.sections.find(s=>s.id===v)?.name||'未分组');
 if(k==='tags')return short(v.map(id=>state.tags.find(t=>t.id===id)?.name||id).join('、')||'无标签');
 if(k==='notes')return v?'备注 '+v.length+' 字符':'无备注';
 if(k==='links')return short(v.length+' 个链接'+(v.some(l=>l.name)?' · '+v.map(l=>l.name||'未命名').join('、'):''));
 if(k==='checklist')return short(v.map(c=>(c.done?'✓ ':'○ ')+c.text).join('；')||'无检查项');
 if(k==='extraReminders')return short(v.map(r=>r.at.replace('T',' ')).join('、')||'无');
 if(k==='parentId')return short(state.tasks.find(t=>t.id===v)?.title||'无');
 if(k==='dependsOn')return short(v.map(id=>state.tasks.find(t=>t.id===id)?.title||id).join('、')||'无');
 if(k==='seriesHold')return v?'已暂停':'未暂停';
 if(k==='weekdays')return short(v.join('、')||'默认');
 return short(['repeat','stage','miss'].includes(k)&&typeof v==='string'&&Object.hasOwn(names,v)?names[v]:(v===''?'未设置':v));
}
export function validActivity(a){
 return Array.isArray(a)&&a.length<=ACTIVITY_LIMIT&&bytes(a)<=ACTIVITY_BYTES&&new Set(a.map(e=>e?.id)).size===a.length&&a.every(e=>e&&str(e.id,220)&&e.id&&stamp(e.at)&&SOURCES.includes(e.source)&&CATEGORIES.includes(e.category)&&(e.taskId===undefined||typeof e.taskId==='string')&&str(e.label,80)&&str(e.kind,40)&&str(e.operation,180)&&str(e.session,80)&&Array.isArray(e.changes)&&e.changes.length<=32&&e.changes.every(c=>c&&str(c.field,40)&&str(c.label,80)&&str(c.before,160)&&str(c.after,160)));
}
const order=(a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id);
export function mergeActivity(...arrays){
 const entries=new Map();
 for(const a of arrays)for(const e of a||[]){const old=entries.get(e.id);if(!old||order(old,e)<0||(order(old,e)===0&&JSON.stringify(old)<JSON.stringify(e)))entries.set(e.id,e)}
 const sorted=[...entries.values()].sort(order).slice(-ACTIVITY_LIMIT),result=[];
 let total=2;
 // Count UTF-8 bytes once per retained event, including JSON array separators.
 for(let i=sorted.length-1;i>=0;i--){const size=bytes(sorted[i])+(result.length?1:0);if(total+size>ACTIVITY_BYTES)break;total+=size;result.push(sorted[i])}
 return result.reverse();
}
function event(meta,task,kind,label,category,changes=[],at=meta.at){
 return {id:meta.id+':'+kind,taskId:task.id,operation:meta.id,session:meta.session||'',at,source:meta.source||'manual',kind,label,category,changes};
}
function legacy(task){
 const out=[];const add=(kind,label,at)=>{if(stamp(at))out.push(event({id:'legacy:'+kind+':'+at,at,source:'legacy'},task,kind,label,'lifecycle'))};
 add('created','创建任务',task.createdAt);add('completed','完成任务',task.completedAt);add('deleted','移入回收站',task.deletedAt);if(task.previousId)add('generated','由上一重复实例生成',task.createdAt);return out;
}
export function displayActivity(task){
 const logs=(task.activity||[]).filter(e=>e.taskId===undefined||e.taskId===task.id),known=new Set(logs.filter(e=>e.category==='lifecycle').map(e=>e.kind+'|'+e.at));
 return [...logs,...legacy(task).filter(e=>!known.has(e.kind+'|'+e.at))].sort(order);
}
function append(existing,e){
 const last=existing.at(-1);
 // Notes are edited on each keystroke. Coalesce only within the same live session.
 if((e.kind==='notes'||e.kind==='title'&&e.session.startsWith('title:'))&&last?.kind===e.kind&&e.session&&last.session===e.session&&last.source===e.source&&Date.parse(e.at)-Date.parse(last.at)>=0&&Date.parse(e.at)-Date.parse(last.at)<30000){
  return mergeActivity(existing.slice(0,-1),[{...e,id:last.id,operation:last.operation,changes:[{...e.changes[0],before:last.changes[0].before}]}]);
 }
 return mergeActivity(existing,[e]);
}
export function recordTaskChanges(before,next,meta,{restore=false}={}){
 if(before===next||!stamp(meta.at))return next;
 if(before.tasks===next.tasks&&before.sessions===next.sessions)return next;
 const old=new Map(before.tasks.map(t=>[t.id,t])),newIds=new Set(next.tasks.map(t=>t.id));
 const children=new Map(),oldChildren=new Map();
 for(const [state,map] of [[before,oldChildren],[next,children]])for(const t of state.tasks)if(t.parentId&&!t.deletedAt){if(!map.has(t.parentId))map.set(t.parentId,[]);map.get(t.parentId).push(t.id)}
 const sessions=new Map(),known=new Set((before.sessions||[]).map(s=>s.id));
 for(const s of next.sessions||[])if(s.taskId&&!known.has(s.id)&&newIds.has(s.taskId)){if(!sessions.has(s.taskId))sessions.set(s.taskId,[]);sessions.get(s.taskId).push(s)}
 let modified=false;
 const tasks=next.tasks.map(t=>{
  const prev=old.get(t.id);
  if(prev===t&&!restore&&!sessions.has(t.id)&&equal(oldChildren.get(t.id)||[],children.get(t.id)||[]))return t;
  let logs=prev?mergeActivity(prev.activity,restore?t.activity:[]):restore?mergeActivity(t.activity):[];logs=logs.filter(e=>e.taskId===undefined||e.taskId===t.id);
  const entries=[];
  if(!prev){if(!restore){if(stamp(t.createdAt))entries.push(event(meta,t,'created','创建任务','lifecycle',[],t.createdAt));if(t.previousId&&stamp(t.createdAt))entries.push(event({...meta,source:'system'},t,'generated','由上一重复实例生成','lifecycle',[],t.createdAt))}else entries.push(event(meta,t,'restored','恢复任务记录','lifecycle'))}
  else if(prev!==t){
   if(prev.status!==t.status){const kind=t.status==='completed'?'completed':t.status==='skipped'?'skipped':'reopened';entries.push(event(meta,t,kind,{completed:'完成任务',skipped:'跳过任务',reopened:'恢复待办'}[kind],'lifecycle',[],kind==='completed'&&stamp(t.completedAt)?t.completedAt:meta.at))}
   if(prev.deletedAt!==t.deletedAt)entries.push(event(meta,t,t.deletedAt?'deleted':'restored',t.deletedAt?'移入回收站':'恢复任务','lifecycle',[],stamp(t.deletedAt)?t.deletedAt:meta.at));
   const changes=[];
   for(const [k,label,category] of fields){
    if(k==='stage'&&prev.status!==t.status)continue;
    const a=norm(k,prev[k]),b=norm(k,t[k]);if(equal(a,b))continue;
    changes.push({field:k,label,category,before:describe(k,a,before,prev),after:describe(k,b,next,t)});
   }
   // Explicitly group all changed fields in one committed operation.
   if(changes.length){const first=changes[0];entries.push(event(meta,t,changes.length===1?first.field:'updated',changes.length===1?first.label:'更新任务属性',first.category,changes.map(({category,...c})=>c)))}
  }
  if(!equal(oldChildren.get(t.id)||[],children.get(t.id)||[])&&prev)entries.push(event(meta,t,'children','修改子任务','relation',[{field:'children',label:'子任务数量',before:String((oldChildren.get(t.id)||[]).length),after:String((children.get(t.id)||[]).length)}]));
  if(sessions.has(t.id))for(const s of sessions.get(t.id)){
   const seconds=Math.floor(s.seconds),minutes=Math.floor(seconds/60),remainder=seconds%60;
   const duration=(minutes?minutes+' 分钟':'')+(remainder?(minutes?' ':'')+remainder+' 秒':minutes?'':'0 秒');
   // Stable record-linked events collapse replicated settlements without hiding distinct sessions.
   const identity='focus:'+s.id;
   entries.push(event(identity.length<=174?{...meta,id:identity}:meta,t,'focus','完成专注','focus',[{field:'focus',label:'专注时长',before:'',after:duration}]));
  }
  if(!entries.length&&!restore){if(prev||!t.activity)return t;const {activity,...clean}=t;modified=true;return clean}
  if(entries.length&&prev){const known=new Set(logs.map(e=>e.kind+'|'+e.at));logs=mergeActivity(logs,legacy(prev).filter(e=>['completed','deleted'].includes(e.kind)&&!known.has(e.kind+'|'+e.at)))}
  for(const e of entries)logs=append(logs,e);
  if(equal(t.activity||[],logs))return t;
  modified=true;return {...t,activity:logs};
 });
 return modified?{...next,tasks}:next;
}
// A successful device-local attachment operation records metadata only.
export function recordAttachment(state,taskId,kind,meta){
 const t=state.tasks.find(t=>t.id===taskId);if(!t)return state;
 const e=event({...meta,source:'device'},t,kind,kind==='attachmentAdded'?'添加本机附件':'移除本机附件','content');
 const logs=mergeActivity(t.activity,[e]);return {...state,tasks:state.tasks.map(x=>x===t?{...x,activity:logs}:x)};
}

export function activityMatches(event,category){return category==='all'||event.category===category||event.changes?.some(c=>fields.some(([k,,group])=>c.field===k&&group===category))}
