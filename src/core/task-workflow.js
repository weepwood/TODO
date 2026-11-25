import {newTask,validDate,validTime,id} from './domain.js';
import {validPoints} from './points.js';
export function templateTask(template,data,{listId,date='',title}={}){
 const old=template.task,list=data.lists.find(l=>l.id===listId);
 if(!list||typeof title!=='string'||!title.trim()||(date&&!validDate(date)))return null;
 return {...newTask(title,list.id,date),notes:old.notes,priority:[0,1,2,3].includes(old.priority)?old.priority:0,
 duration:Number.isInteger(old.duration)&&old.duration>=1&&old.duration<=1440?old.duration:30,time:date&&validTime(old.time)?old.time:'',
 ...(validPoints(old.points)?{points:old.points}:{}),tags:(old.tags||[]).filter(x=>data.tags.some(a=>a.id===x)),
 checklist:old.checklist.map(c=>({id:id(),text:c.text,done:false}))};
}
export function focusSetup(task,config){
 if(!task||task.deletedAt||task.status!=='pending')return {taskId:'',minutes:config.focus};
 return {taskId:task.id,minutes:Math.max(1,Math.min(180,Number.isFinite(task.duration)?Math.round(task.duration):config.focus))};
}
export function favoriteLists(lists,ids){
 const set=new Set(ids);return lists.filter(l=>l.id!=='inbox'&&set.has(l.id));
}
