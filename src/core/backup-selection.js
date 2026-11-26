// Read-only comparison, never restores or modifies any record.
import {canonical} from '../services/cloud-core.js';
const KEYS=['title','notes','listId','sectionId','date','time','duration','deadline','priority','status','deletedAt','parentId','dependsOn','checklist','links','planMinutes','planSegments','planLocked','tags','repeat','seriesHold'];
export function backupTaskChanges(current,incoming){
 const a=new Map(current.tasks.map(t=>[t.id,t])),b=new Map(incoming.tasks.map(t=>[t.id,t])),rows=[];
 for(const [id,t] of b){const old=a.get(id);if(!old){rows.push({id,title:t.title,kind:'added',fields:[]});continue}if(canonical(old)===canonical(t))continue;const fields=KEYS.filter(k=>canonical(old[k])!==canonical(t[k]));rows.push({id,title:t.title,kind:'changed',fields:fields.length?fields:['other']})}
 for(const [id,t] of a)if(!b.has(id))rows.push({id,title:t.title,kind:'removed',fields:[]});
 return rows;
}
