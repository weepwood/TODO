// A task estimate is not its calendar occupancy. Legacy tasks use the estimate
// until an explicit block length is chosen. Locks protect scheduling tools.
export const blockMinutes=t=>Number.isInteger(t.planMinutes)&&t.planMinutes>=1&&t.planMinutes<=1440?t.planMinutes:t.duration;
export const validBlock=t=>(t.planMinutes===undefined||t.planMinutes===null||Number.isInteger(t.planMinutes)&&t.planMinutes>=1&&t.planMinutes<=1440)&&validPlanSegments(t.planSegments)&&(t.planLocked===undefined||typeof t.planLocked==='boolean');
export function blockPatch(task,fields){
 if(Object.hasOwn(fields,'planSegments')&&!validPlanSegments(fields.planSegments))return null;
 if(task.planLocked&&['date','time','planMinutes','planSegments','anchor'].some(k=>Object.hasOwn(fields,k)&&JSON.stringify(fields[k])!==JSON.stringify(task[k])))return null;
 return fields.planLocked===true?{...fields,planMinutes:Math.max(1,Math.min(1440,Math.round(blockMinutes(task))))}:fields;
}

// Supplemental segments use local wall-clock times and a task-scoped identity.
const dateValid=s=>typeof s==='string'&&s.slice(0,4)>='1900'&&s.slice(0,4)<='9998'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const timeValid=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export function validPlanSegments(rows){
 return rows===undefined||Array.isArray(rows)&&rows.length<=30&&new Set(rows.map(r=>r?.id)).size===rows.length&&rows.every(r=>r&&typeof r.id==='string'&&r.id.length>0&&r.id.length<=100&&dateValid(r.date)&&timeValid(r.time)&&Number.isInteger(r.minutes)&&r.minutes>=1&&r.minutes<=1440);
}
export function expandPlanBlocks(tasks){
 return tasks.flatMap(t=>[t,...(t.planSegments||[]).map(s=>({...t,id:'plan-segment:'+JSON.stringify([t.id,s.id]),ownerId:t.id,segmentId:s.id,date:s.date,time:s.time,duration:s.minutes,planMinutes:s.minutes,planSegments:[],planLocked:true}))]);
}
export function protectLockedTasks(before,after){
 if(before.tasks===after.tasks)return after;
 const byId=new Map(before.tasks.filter(t=>t.planLocked&&t.status==='pending'&&!t.deletedAt).map(t=>[t.id,t]));
 let changed=false;
 const tasks=after.tasks.map(t=>{const old=byId.get(t.id);if(!old||t.status!=='pending'||t.deletedAt)return t;
  const fields=['date','time','anchor','planMinutes','planSegments'];
  if(!fields.some(k=>JSON.stringify(old[k])!==JSON.stringify(t[k])))return t;
  changed=true;const next={...t};for(const k of fields){if(old[k]===undefined)delete next[k];else next[k]=old[k]}return next;
 });return changed?{...after,tasks}:after;
}

// Compare the entire segment list at commit, not just its ID.
export function editPlanSegments(task,expected,next){
 if(!task||task.status!=='pending'||task.deletedAt||task.planLocked||JSON.stringify(task.planSegments||[])!==JSON.stringify(expected)||!validPlanSegments(next))return null;
 return {planSegments:next};
}
