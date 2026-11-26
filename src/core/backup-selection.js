import {sameRecord} from './record-equality.js';
import {migrateState} from './domain.js';
const KEYS=['title','notes','listId','sectionId','date','time','duration','deadline','priority','status','deletedAt','parentId','dependsOn','checklist','links','planMinutes','planSegments','planLocked','tags','repeat','seriesHold'];
export function backupTaskChanges(current,incoming){
 const a=new Map(current.tasks.map(t=>[t.id,t])),b=new Map(incoming.tasks.map(t=>[t.id,t])),rows=[];
 for(const [id,t] of b){const old=a.get(id);if(!old){rows.push({id,title:t.title,kind:'added',fields:[]});continue}if(sameRecord(old,t))continue;const fields=KEYS.filter(k=>!sameRecord(old[k],t[k]));rows.push({id,title:t.title,kind:'changed',fields:fields.length?fields:['other']})}
 for(const [id,t] of a)if(!b.has(id))rows.push({id,title:t.title,kind:'removed',fields:[]});
 return rows;
}

// Limited content-only restore. Never resurrect identities, restore history,
// change associations or replace attachments. Exact before/after field snapshots
// plus identity and eligibility are revalidated in the commit reducer.
const CONTENT=['title','notes','priority'];
const ordinary=t=>t&&t.status==='pending'&&!t.deletedAt&&t.repeat==='none'&&!t.seriesId&&!t.previousId&&!t.seriesHold;
export function previewContentRestore(current,incoming,ids){
 if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)return [];
 const source=new Map(incoming.tasks.map(t=>[t.id,t])),wanted=new Set(ids);
 return current.tasks.filter(t=>wanted.has(t.id)).flatMap(t=>{
  const other=source.get(t.id);
  if(!ordinary(t)||!ordinary(other)||t.createdAt!==other.createdAt)return [];
  if(typeof other.title!=='string'||!other.title.trim()||other.title.length>500||typeof other.notes!=='string'||other.notes.length>50000||![0,1,2,3].includes(other.priority))return [];
  const before=Object.fromEntries(CONTENT.map(k=>[k,t[k]])),after=Object.fromEntries(CONTENT.map(k=>[k,other[k]]));
  return sameRecord(before,after)?[]:[{id:t.id,createdAt:t.createdAt,before,after}];
 });
}
export function applyContentRestore(current,incoming,ids,expected){
 const fresh=previewContentRestore(current,incoming,ids);
 if(!fresh.length||!sameRecord(fresh,expected))return current;
 const byId=new Map(fresh.map(r=>[r.id,r.after]));
 const next={...current,tasks:current.tasks.map(t=>byId.has(t.id)?{...t,...byId.get(t.id)}:t)};
 try{migrateState(next);return next}catch{return current}
}
