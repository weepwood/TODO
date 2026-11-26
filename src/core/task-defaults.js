import {blockMinutes} from './plan-block.js';
import {newTask,shiftDay,validDate,validTime} from './domain.js';
import {taskConflicts} from './advanced.js';
import {validPoints} from './points.js';
export function normalizeTaskDefaults(value){
 const v=value||{};
 return {reminderTime:validTime(v.reminderTime)?v.reminderTime:'',duration:Number.isInteger(v.duration)&&v.duration>=1&&v.duration<=1440?v.duration:30,priority:[0,1,2,3].includes(v.priority)?v.priority:0,points:validPoints(v.points)?v.points:0,date:['none','today','tomorrow'].includes(v.date)?v.date:'none',sectionId:typeof v.sectionId==='string'&&v.sectionId.length<=256?v.sectionId:null};
}
export function captureProperties({parsed,list,today,date='',time='',sectionId,defaults,now=new Date()}){
 const pref=normalizeTaskDefaults(defaults),target=parsed.date||date||(pref.date==='today'?today:pref.date==='tomorrow'?shiftDay(today,1):'');
 const candidate=validDate(target)&&pref.reminderTime?target+'T'+pref.reminderTime:'';
 const reminderAt=candidate&&new Date(candidate)>now?candidate:'';
 const section=sectionId===undefined?pref.sectionId:sectionId;
 return {date:target,reminderAt,time:parsed.time||time,priority:parsed.priority||pref.priority,duration:pref.duration,...(parsed.points!==undefined||pref.points!==0?{points:parsed.points??pref.points}:{}),sectionId:list.sections?.some(s=>s.id===section)?section:null};
}
export function taskFromCapture(args){const props=captureProperties(args);return {...newTask(args.parsed.title,args.list.id,props.date),...props}}
export function previewPostpone(tasks,ids,days){
 const selected=new Set(ids),rows=[];
 if(![1,3,7].includes(days))return {rows,skipped:selected.size,conflicts:0};
 for(const t of tasks){if(!selected.has(t.id)||t.planLocked||t.deletedAt||t.status!=='pending'||t.repeat!=='none'||t.seriesId||t.previousId||!validDate(t.date))continue;
 const date=shiftDay(t.date,days);if(!validDate(date))continue;
 rows.push({id:t.id,title:t.title,from:t.date,to:date,time:t.time,duration:blockMinutes(t)});}
 const changes=new Map(rows.map(r=>[r.id,r.to]));
 const next=tasks.map(t=>changes.has(t.id)?{...t,date:changes.get(t.id),anchor:Number(changes.get(t.id).slice(-2))}:t);
 const conflicts=taskConflicts(next);
 return {rows,skipped:selected.size-rows.length,conflicts:rows.filter(r=>conflicts.has(r.id)).length};
}
export function applyPostpone(tasks,preview,days){
 const current=previewPostpone(tasks,preview.rows.map(r=>r.id),days);
 const byId=new Map(current.rows.map(r=>[r.id,r]));
 if(preview.rows.some(r=>{const c=byId.get(r.id);return !c||c.from!==r.from||c.to!==r.to||c.time!==r.time||c.duration!==r.duration}))return tasks;
 const changes=new Map(preview.rows.map(r=>[r.id,r.to]));
 return tasks.map(t=>changes.has(t.id)?{...t,date:changes.get(t.id),anchor:Number(changes.get(t.id).slice(-2))}:t);
}
export function taskFocusSummary(sessions,id){
 const records=sessions.filter(s=>s.taskId===id&&s.mode!=='break'&&Number.isFinite(s.seconds)&&s.seconds>=0);
 return {count:records.length,minutes:Math.round(records.reduce((n,s)=>n+s.seconds,0)/60)};
}
