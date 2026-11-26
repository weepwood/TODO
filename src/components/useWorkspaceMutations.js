import {useMemo,useRef,useEffect} from 'react';
import {id,dayKey,saveState} from '../core/domain.js';
import {protectLockedTasks} from '../core/plan-block.js';
import {recordTaskChanges} from '../core/task-activity.js';
import {eventRules} from '../core/workflow-rules.js';

// Keep memoized callbacks outside the App render's lexical environment.
// Otherwise alternating memoized callbacks can retain earlier renders and
// their derived task arrays even after the bounded undo window has expired.
export function applyWorkspaceEdit(d,value,meta,{allowAutomation,rules}){
 const next=protectLockedTasks(d,typeof value==='function'?value(d):value);
 const recorded=recordTaskChanges(d,next,meta);
 if(!allowAutomation||typeof value!=='function')return recorded;
 const automated=eventRules(d,next,rules,dayKey(new Date(meta.at)),{id:meta.id,at:meta.at,trigger:meta.trigger});
 if(automated===next)return recorded;
 const byId=new Map(recorded.tasks.map(t=>[t.id,t]));
 const result={...automated,tasks:automated.tasks.map(t=>{const r=byId.get(t.id);return r?.activity?{...t,activity:r.activity}:t})};
 return recordTaskChanges(recorded,result,{...meta,id:meta.id+':auto',source:'automation'});
}
export function createWorkspaceEditor(rawEdit,{session,allowAutomation,rules}){
 return (value,source='manual',typingSession)=>{
  const meta={id:id(),at:new Date().toISOString(),trigger:'event',source,session:typingSession||session};
  rawEdit(d=>applyWorkspaceEdit(d,value,meta,{allowAutomation,rules}),source,false);
 };
}
export function useWorkspaceEdit(rawEdit,{session,allowAutomation,rules}){
 return useMemo(()=>createWorkspaceEditor(rawEdit,{session,allowAutomation,rules}),[rawEdit,session,allowAutomation,rules]);
}

export function createWorkspacePersister(storage,data,blocked,draft,reportError,cliReceipt){
 return ()=>{
  if(blocked)return false;
  try{
   if(cliReceipt&&storage.stageCliWorkspace)storage.stageCliWorkspace(cliReceipt.data,cliReceipt.result);
   if(storage.stageWorkspace)storage.stageWorkspace(data);else saveState(storage,data);
   draft.current.staged=data;reportError('');return true;
  }catch(e){
   reportError(e?.name==='QuotaExceededError'?'本地存储空间不足，当前修改尚未保存。请先导出数据。':'本地保存失败，当前修改尚未保存。请先导出数据。');return false;
  }
 };
}
export function useWorkspacePersistence({storage,data,blocked,storageError,pilot,native,reportError,cliReceipt,clearCliReceipt}){
 const draft=useRef({current:data,staged:null});
 draft.current.current=data;
 const persist=useMemo(()=>createWorkspacePersister(storage,data,blocked,draft,reportError,cliReceipt),[storage,data,blocked,reportError,cliReceipt]);
 useEffect(()=>{if(persist()&&cliReceipt&&storage.stageCliWorkspace)clearCliReceipt?.(cliReceipt.result.id)},[persist,cliReceipt,storage,clearCliReceipt]);
 useEffect(()=>{
  if(native||(!pilot&&(!storageError||blocked)))return;
  const guard=e=>{
   if(pilot&&!storageError&&draft.current.current===draft.current.staged&&!storage.getStatus?.().pending&&!storage.getStatus?.().error)return;
   e.preventDefault();e.returnValue='';
  };
  window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);
 },[native,pilot,storageError,blocked,storage]);
 return persist;
}
