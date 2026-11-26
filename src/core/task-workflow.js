import {newTask,validDate,validTime,id} from './domain.js';
import {validPoints} from './points.js';
export function templateTask(template,data,{listId,date='',title,duration,priority,time,project=''}={}){
 const old=template.task,list=data.lists.find(l=>l.id===listId);
 if(!list||typeof title!=='string'||!title.trim()||(date&&!validDate(date))||duration!==undefined&&(!Number.isInteger(duration)||duration<1||duration>1440)||priority!==undefined&&![0,1,2,3].includes(priority)||time!==undefined&&time!==''&&(!date||!validTime(time)))return null;
 const replace=text=>String(text).replace(/\{\{(项目|日期|清单)\}\}/g,(_,k)=>({项目:project.trim(),日期:date,清单:list.name}[k]));
 if(typeof project!=='string'||project.length>100)return null;
 const name=replace(title).trim(),notes=replace(old.notes);
 if(!name||name.length>500||notes.length>50000||old.checklist.some(c=>!replace(c.text).trim())||[title,old.notes,...old.checklist.map(c=>c.text)].some(v=>v.includes('{{项目}}')&&!project.trim()||v.includes('{{日期}}')&&!date))return null;
 return {...newTask(name,list.id,date),notes,priority:priority??([0,1,2,3].includes(old.priority)?old.priority:0),
 duration:duration??(Number.isInteger(old.duration)&&old.duration>=1&&old.duration<=1440?old.duration:30),time:time??(date&&validTime(old.time)?old.time:''),
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
