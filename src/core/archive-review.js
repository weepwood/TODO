import {insightsMarkdown} from './review-insights.js';
import {validVisual} from './review-visual.js';
import {dayKey,validDate,id} from './domain.js';
import {reviewMarkdown} from './task-review.js';
export function archivePreference(state,listId,archived){
 if(typeof listId!=='string'||listId==='inbox')return state;
 const ids=new Set(state.archivedLists||[]);
 if(archived){if(ids.size>=300&&!ids.has(listId))return state;ids.add(listId)}else ids.delete(listId);
 return {...state,archivedLists:[...ids]};
}
export function filterHistory(tasks,{since='',until='',list='all',tag='all'}={}){
 if((since&&!validDate(since))||(until&&!validDate(until))||(since&&until&&since>until))return [];
 return tasks.filter(t=>{
  if(list!=='all'&&t.listId!==list||tag!=='all'&&!t.tags?.includes(tag))return false;
  if(!since&&!until)return true;
  const date=Number.isFinite(Date.parse(t.completedAt))?dayKey(new Date(t.completedAt)):'';
  return !!date&&(!since||date>=since)&&(!until||date<=until);
 });
}
export const SNAPSHOT_KEY='todo-review-snapshots-v1';
export const SNAPSHOT_LIMIT=30;
const MAX_BYTES=2*1024*1024;
function validSnapshot(s){return s&&typeof s.id==='string'&&validDate(s.since)&&validDate(s.until)&&s.since<=s.until&&['day','week','month'].includes(s.mode)&&Number.isFinite(Date.parse(s.savedAt))&&typeof s.markdown==='string'&&(s.visual===undefined||validVisual(s.visual))}
export function readSnapshots(storage){
 const raw=storage.getItem(SNAPSHOT_KEY);
 if(raw===null||raw===undefined)return [];
 const rows=JSON.parse(raw);
 if(!Array.isArray(rows)||rows.length>SNAPSHOT_LIMIT||!rows.every(validSnapshot)||new Set(rows.map(x=>x.id)).size!==rows.length)throw Error('回顾快照存储异常，原记录保留');
 return rows;
}
export function saveSnapshot(storage,review,mode,now=new Date(),visual){
 const rows=readSnapshots(storage);
 if(rows.length>=SNAPSHOT_LIMIT)throw Error('已达到30份快照上限，请先导出并删除不需要的记录');
 const savedAt=now.toISOString(),snapshot={id:id(),since:review.since,until:review.until,mode,savedAt,...(visual?{visual}:{}),markdown:reviewMarkdown(review).replace('基于导出时的当前数据；计划、积压和冲突并非历史快照。','冻结于 '+savedAt+' 的数据重算结果；不是原计划的事件历史。')+insightsMarkdown(visual?.insights)};
 if(!validSnapshot(snapshot))throw Error('回顾快照无效');
 const next=[snapshot,...rows],raw=JSON.stringify(next);
 if(new TextEncoder().encode(raw).length>MAX_BYTES)throw Error('快照存储达到2 MiB上限，请先导出或删除旧快照');
 storage.setItem(SNAPSHOT_KEY,raw);return next;
}
export function deleteSnapshot(storage,snapshotId){
 const rows=readSnapshots(storage).filter(s=>s.id!==snapshotId);
 storage.setItem(SNAPSHOT_KEY,JSON.stringify(rows));return rows;
}
