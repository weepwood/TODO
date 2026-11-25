import {canonical} from './cloud-core.js';
const eq=(a,b)=>canonical(a)===canonical(b);
// Stable task ordering, no deletion, unchanged non-task fields. Anything else uses the existing snapshot CAS.
export function buildTaskDelta(base,next){
 if(!base||!next)return null;
 const omit=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k!=='tasks'));
 if(!eq(omit(base),omit(next)))return null;
 if(next.tasks.length<base.tasks.length||base.tasks.some((t,i)=>t.id!==next.tasks[i].id))return null;
 const ids=new Set(next.tasks.map(t=>t.id));if(ids.size!==next.tasks.length)return null;
 const changed=next.tasks.filter((t,i)=>i>=base.tasks.length||!eq(t,base.tasks[i]));
 if(!changed.length||changed.length>500||changed.some(t=>typeof t.id!=='string'||!t.id||t.id.length>200))return null;
 const bytes=new TextEncoder().encode(JSON.stringify(changed)).length;
 if(bytes>900000||bytes>=new TextEncoder().encode(JSON.stringify(next)).length*.75)return null;
 return changed;
}
export function applyTaskDelta(base,delta){
 const edits=new Map(delta.map(t=>[t.id,t])),existing=new Set(base.tasks.map(t=>t.id));
 return {...base,tasks:[...base.tasks.map(t=>edits.get(t.id)||t),...delta.filter(t=>!existing.has(t.id))]};
}

// A verified base is required. Never accept discontinuous or malformed chains.
export function replayTaskDeltas(base,revision,response){
 if(!base||!Number.isSafeInteger(revision)||!response||!Number.isSafeInteger(response.revision)||!Array.isArray(response.patches)||response.patches.length<1||response.patches.length>8)return null;
 let state=base,expected=revision;
 for(const patch of response.patches){
  if(!patch||patch.from!==expected||patch.to!==expected+1||!Array.isArray(patch.tasks)||patch.tasks.length>500)return null;
  if(patch.tasks.some(t=>!t||typeof t.id!=='string'||!t.id||t.id.length>200)||new Set(patch.tasks.map(t=>t.id)).size!==patch.tasks.length)return null;
  state=applyTaskDelta(state,patch.tasks);expected++;
 }
 return expected===response.revision?state:null;
}
