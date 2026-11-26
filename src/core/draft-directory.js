import {noteDraftKey,readNoteDraft} from './professional-workflow.js';
export function listDrafts(storage,tasks){
 const prefix='todo-note-draft-v1:',keys=typeof storage.keys==='function'?storage.keys():Array.from({length:storage.length||0},(_,i)=>storage.key(i));
 const byId=new Map(tasks.map(t=>[t.id,t])),rows=[];
 for(const key of keys){if(typeof key!=='string'||!key.startsWith(prefix))continue;
  let id;try{id=decodeURIComponent(key.slice(prefix.length));if(noteDraftKey(id)!==key)continue}catch{continue}
  const task=byId.get(id);try{const draft=readNoteDraft(storage,id);if(draft)rows.push({base:draft.base,text:draft.text,at:draft.at,id,title:task?.title||'原任务不存在',status:!task||task.deletedAt?'orphaned':task.notes===draft.base?'current':'stale'})}catch(e){rows.push({id,title:task?.title||'原任务不存在',status:'invalid',error:e.message})}
 }
 return rows.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))||a.id.localeCompare(b.id));
}
export function removeDraft(storage,row){
 if(row.status==='invalid')throw Error('损坏的草稿需先导出原记录，不在此处删除');
 const current=readNoteDraft(storage,row.id);if(!current||current.at!==row.at||current.base!==row.base||current.text!==row.text)throw Error('草稿已变化，请刷新');
 storage.removeItem(noteDraftKey(row.id));
}
