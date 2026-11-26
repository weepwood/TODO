import {sameRecord} from './record-equality.js';
import {uniqueWallInstant} from './wall-time.js';
import {migrateState} from './domain.js';
import {newTask,validDate,validTime,id} from './domain.js';
import {validPoints} from './points.js';
export function templateTask(template,data,{listId,date='',title,duration,priority,time,project=''}={}){
 const old=template.task,list=data.lists.find(l=>l.id===listId);
 if(!list||typeof title!=='string'||!title.trim()||(date&&!validDate(date))||duration!==undefined&&(!Number.isInteger(duration)||duration<1||duration>1440)||priority!==undefined&&![0,1,2,3].includes(priority)||time!==undefined&&time!==''&&(!date||!validTime(time)||uniqueWallInstant(date,time)===null))return null;
 const replace=text=>String(text).replace(/\{\{(项目|日期|清单)\}\}/g,(_,k)=>({项目:project.trim(),日期:date,清单:list.name}[k]));
 if(typeof project!=='string'||project.length>100)return null;
 const name=replace(title).trim(),notes=replace(old.notes),selectedTime=time??(date&&validTime(old.time)?old.time:"");
 if(selectedTime&&uniqueWallInstant(date,selectedTime)===null)return null;
 if(!name||name.length>500||notes.length>50000||old.checklist.some(c=>!replace(c.text).trim())||[title,old.notes,...old.checklist.map(c=>c.text)].some(v=>v.includes('{{项目}}')&&!project.trim()||v.includes('{{日期}}')&&!date))return null;
 return {...newTask(name,list.id,date),notes,priority:priority??([0,1,2,3].includes(old.priority)?old.priority:0),
 duration:duration??(Number.isInteger(old.duration)&&old.duration>=1&&old.duration<=1440?old.duration:30),time:selectedTime,
 ...(validPoints(old.points)?{points:old.points}:{}),tags:(old.tags||[]).filter(x=>data.tags.some(a=>a.id===x)),
 checklist:old.checklist.map(c=>({id:id(),text:replace(c.text),done:false}))};
}
export function focusSetup(task,config){
 if(!task||task.deletedAt||task.status!=='pending')return {taskId:'',minutes:config.focus};
 return {taskId:task.id,minutes:Math.max(1,Math.min(180,Number.isFinite(task.duration)?Math.round(task.duration):config.focus))};
}
export function favoriteLists(lists,ids){
 const set=new Set(ids);return lists.filter(l=>l.id!=='inbox'&&set.has(l.id));
}

export function appendTemplateInstance(data,expected,t){
 const current=data.templates.find(x=>x.id===expected?.id);
 if(!current||!sameRecord(current,expected)||data.tasks.length>=100000||data.tasks.some(x=>x.id===t.id)||!data.lists.some(l=>l.id===t.listId)||(t.tags||[]).some(id=>!data.tags.some(tag=>tag.id===id)))return data;
 const next={...data,tasks:[...data.tasks,t]};try{migrateState(next);return next}catch{return data}
}
export function changeTemplate(data,expected,name){
 const current=data.templates.find(t=>t.id===expected?.id);
 if(!current||!sameRecord(current,expected)||name!==null&&(typeof name!=='string'||!name.trim()||name.trim().length>100))return data;
 return {...data,templates:name===null?data.templates.filter(t=>t!==current):data.templates.map(t=>t===current?{...t,name:name.trim()}:t)};
}
