import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {desktopNative} from '../runtime.js';
export function useNativeShortcut(uid,callback){useEffect(()=>{if(!desktopNative)return;let disposed=false,unlisten;const consume=()=>invoke('native_take_quick_capture',{scope:uid||'guest'}).then(pending=>{if(!disposed&&pending!==null)callback(pending)}).catch(()=>{});listen('todo-quick-add',consume).then(fn=>{if(disposed)fn();else{unlisten=fn;consume()}}).catch(()=>{});return()=>{disposed=true;unlisten?.()}},[uid,callback])}
export function useNativeShortcutStatus(){const [status,setStatus]=useState('unknown');useEffect(()=>{if(!desktopNative)return;let alive=true;invoke('native_shortcut_status').then(v=>{if(alive)setStatus(v)}).catch(()=>{});return()=>{alive=false}},[]);return status}
export function useNativeQuit(storage,onError){useEffect(()=>{if(!desktopNative||!storage)return;let disposed=false,unlisten;listen('todo-quit-request',async()=>{if(await storage.flush())await invoke('native_exit');else onError('SQLite 保存失败，已取消退出。请重试保存或导出数据。')}).then(fn=>{if(disposed)fn();else unlisten=fn}).catch(()=>{});return()=>{disposed=true;unlisten?.()}},[storage,onError])}

export function nativeOpenCapture(){return invoke('native_open_capture')}

// Main is the only writer. A request remains pending until Rust verifies its
// UUID in the committed SQLite snapshot; retrying cannot append a second task.
const requestIds=req=>req.batch_count==null?[req.id]:Array.from({length:req.batch_count},(_,i)=>req.id+":"+(i+1));
export function useDirectCapture({uid,storage,data,blocked,edit,onSaved}){
 const latest=useRef(null);latest.current={data,blocked,edit,onSaved};const inFlight=useRef(false);
 useEffect(()=>{if(!desktopNative||!storage?.flush)return;let disposed=false,attempt=null;
 const scope=uid||'guest';const poll=async()=>{if(disposed||inFlight.current)return;inFlight.current=true;
 try{
  if(attempt){
   if(latest.current.blocked)return;
   if(!await storage.flush()||disposed)return;
   if(await invoke('native_direct_ack',{scope,generation:attempt.generation,id:attempt.id})){attempt=null;if(!disposed)latest.current.onSaved();return}
   if(disposed)return;
   // An attempted task is never appended again in this session. If it was
   // undone before the first commit, terminate the outstanding request.
   if(!requestIds(attempt).every(id=>latest.current.data.tasks.some(t=>t.id===id))){await invoke('native_direct_cancel_pending',{scope,id:attempt.id});attempt=null;return}
   return;
  }
  const req=await invoke('native_direct_pending',{scope});if(disposed||!req||req.scope!==scope||latest.current.blocked)return;
  if(req.batch_count!=null){
   const ids=requestIds(req),present=ids.filter(id=>latest.current.data.tasks.some(t=>t.id===id)).length;
   if(present===ids.length){attempt=req;return}
   if(present){await invoke('native_direct_cancel_pending',{scope,id:req.id});return}
   const {prepareExternalTasks}=await import('../../core/external-capture.js');
   const {appendCapture}=await import('../../core/professional-workflow.js');
   if(disposed||latest.current.blocked)return;
   const make=d=>appendCapture(d,prepareExternalTasks(d,{id:req.id,tasks:JSON.parse(req.text)},new Date(req.created_at*1000)));
   try{if(make(latest.current.data)===latest.current.data)throw Error('invalid batch')}catch{await invoke('native_direct_cancel_pending',{scope,id:req.id});return}
   attempt=req;latest.current.edit(d=>{try{return make(d)}catch{return d}},'device');return;
  }
  if(!latest.current.data.tasks.some(t=>t.id===req.id)){
   const {quickParse}=await import('../../core/advanced.js');const {newTask,dayKey}=await import('../../core/domain.js');
   if(disposed||latest.current.blocked)return;const parsed=quickParse(req.text,dayKey(new Date(req.created_at?req.created_at*1000:Date.now())));if(!parsed.title){await invoke('native_direct_cancel_pending',{scope,id:req.id});return}
   const task={...newTask(parsed.title,'inbox',parsed.date,req.id),time:parsed.time,priority:parsed.priority,...(parsed.points===undefined?{}:{points:parsed.points})};
   attempt=req;latest.current.edit(d=>d.tasks.some(t=>t.id===req.id)?d:{...d,tasks:[...d.tasks,task]});return;
  }
  attempt=req;
 }catch{}finally{inFlight.current=false}};
 const timer=setInterval(poll,1000);poll();return()=>{disposed=true;clearInterval(timer)}},[uid,storage]);
}

// Operation queue is separate from legacy text/batch capture. A request is
// terminal only when SQLite commits the exact workspace and local-only receipt.
export function useCliOperations({uid,storage,data,blocked,apply,editor,onSaved,preferencesStorage}){
 const latest=useRef(null);latest.current={data,blocked,apply,editor,onSaved,preferencesStorage};
 const [approval,setApproval]=useState(null);const approvalRef=useRef(null);
 const resolveApproval=decision=>approvalRef.current?.(decision);
 const inFlight=useRef(false);
 useEffect(()=>{if(!desktopNative||!storage?.stageCliWorkspace)return;let disposed=false,attempt=null;
  const scope=uid||'guest';
  const poll=async()=>{if(disposed||inFlight.current)return;inFlight.current=true;
   try{
    if(latest.current.blocked)return;
    const req=await invoke('native_cli_next',{scope});if(disposed)return;
    if(!req){if(attempt){attempt=null;latest.current.onSaved?.()}return}
    if(attempt===req.id)return;
    if(!await storage.flush()||disposed||latest.current.blocked)return;
    const expected=latest.current.data,now=new Date(),context=latest.current.editor;
    let next=expected,result,userConfirmation=null;
    try{
     const {prepareCliOperation}=await import('../../core/cli-operations.js');
     const {applyWorkspaceEdit}=await import('../../components/useWorkspaceMutations.js');
     const {operationGroup,...request}=JSON.parse(req.text);
     if(request.op.startsWith('focus-')&&now.getTime()-req.created_at*1000>30000)throw Error('专注指令已过期，请打开应用后重新提交');
     const {HISTORY_OPS,readConsistentHistory}=await import('../../core/operation-history.js');
     const readJournal=()=>readConsistentHistory(storage,expected,()=>invoke('native_operation_history',{scope,detail:request.op!=='history-list',...(request.op==='history-show'?{version:request.version}:{})}));
     const journal=HISTORY_OPS.includes(request.op)?await readJournal():undefined;
     const prepared=await prepareCliOperation(expected,request,req.id,now,{reference:req.reference,journal,preferencesStorage:latest.current.preferencesStorage});
     if(prepared.next!==expected){
      next=applyWorkspaceEdit(expected,()=>prepared.next,{id:req.id,at:now.toISOString(),source:'device',session:context.session,trigger:'event'},context);
      // An automation may change other fields; actual saved result is the
      // editor output, not an independently constructed snapshot.
     }
     const {sameRecord}=await import('../../core/record-equality.js');
     const existing=new Map(expected.tasks.map(t=>[t.id,t]));
     const createSideEffects=request.op==='create'&&(Object.keys(next).some(k=>k!=='tasks'&&!sameRecord(expected[k],next[k]))||next.tasks.some(t=>existing.has(t.id)&&!sameRecord(existing.get(t.id),t)));
     if(prepared.next!==expected&&(!request.op.startsWith('focus-')&&(request.op!=='create'||request.allowConflict===true||createSideEffects))){
      const {confirmationText}=await import('../../core/operation-history.js');
      if(prepared.historyRecovery&&!sameRecord({...prepared.next,tasks:prepared.next.tasks.map(({activity,...t})=>t)},{...next,tasks:next.tasks.map(({activity,...t})=>t)}))throw Object.assign(Error('恢复产生额外自动化变更'),{code:'UNPREVIEWED_EFFECT'});
      const message=confirmationText(request.op,expected,next)+(prepared.result.pointsImpact?'\n\n积分余额：'+prepared.result.pointsImpact.before+' → '+prepared.result.pointsImpact.after:'')+(prepared.result.conflicts?.length?'\n\n未恢复的变化：'+prepared.result.conflicts.map(c=>c.reason+' '+(c.fields||[]).join('、')).join('\n'):'');
      if(message.length>16000)throw Object.assign(Error('确认内容过长，请缩小范围'),{code:'CONFIRM_TOO_LARGE'});
      const approved=await new Promise(resolve=>{
       const finish=decision=>{clearTimeout(timeout);approvalRef.current=null;setApproval(null);resolve(decision)};
       const timeout=setTimeout(()=>finish(false),60000);approvalRef.current=finish;setApproval({id:req.id,message});
      });
      if(!approved||disposed)throw Object.assign(Error('用户未在应用内确认或已取消'),{code:'USER_CONFIRM_REQUIRED'});
      if(Date.now()-now.getTime()>60000||latest.current.data!==expected||latest.current.blocked)throw Object.assign(Error('确认后状态或时间已变化，请重新提交'),{code:'STALE_WORKSPACE'});
      // Recompute time-dependent preconditions after the approval wait.
      const fresh=await prepareCliOperation(expected,request,req.id,new Date(),{reference:req.reference,journal:HISTORY_OPS.includes(request.op)?await readJournal():undefined,preferencesStorage:latest.current.preferencesStorage});
      if(request.op==='preview-apply'||request.op==='history-apply'||request.op==='changes-undo'){
       if(!sameRecord(fresh.next,prepared.next))throw Object.assign(Error('确认期间方案变化，请重新预览'),{code:'STALE_PREVIEW'});
      }
      userConfirmation={method:'desktop-modal',at:new Date().toISOString()};
     }
     const {finalizeManagement}=await import('../../core/cli-management.js');
     result={id:req.id,status:'saved',result:{...await finalizeManagement(expected,prepared,next),...(userConfirmation?{userConfirmation}:{})}};
    }catch(e){next=expected;result={id:req.id,status:'cancelled',result:{code:typeof e?.code==='string'?e.code:'DOMAIN_REJECTED',error:String(e?.message||'操作失败').slice(0,500)}}}
    if(disposed||latest.current.blocked)return;
    // Bounded result storage; cancellation must not apply a mutation.
    if(new TextEncoder().encode(JSON.stringify(result)).length>524288){next=expected;result={id:req.id,status:'cancelled',result:{code:'RECEIPT_TOO_LARGE',error:'回执过大，请缩小查询范围'}}}
    attempt=req.id;latest.current.apply(expected,next,result);
   }catch{}finally{inFlight.current=false}
  };
  const timer=setInterval(poll,800);poll();return()=>{disposed=true;clearInterval(timer);approvalRef.current?.(false)};
 },[uid,storage]);
 return {approval,resolveApproval};
}
