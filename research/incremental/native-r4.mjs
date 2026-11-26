import {invoke} from '@tauri-apps/api/core';
import {initialState,newTask,completeTask,reopenTask,reorderTasks,seriesPatch,migrateState} from '../../src/core/domain.js';
import {applyWorkspaceEdit} from '../../src/components/useWorkspaceMutations.js';
import {prepareHistory,readConsistentHistory,snapshotFingerprint} from '../../src/core/operation-history.js';
import {mergeTasks} from '../../src/services/sync-merge.js';
import {canonical} from '../../src/services/cloud-core.js';
import {plan,replay} from './changes.mjs';
import {createDeltaQueue} from './queue-r3.mjs';
import {createCaptureSession} from './capture.mjs';
const K='todo-workbench-v1',scope='guest',out=document.querySelector('pre');
const ok=(v,msg)=>{if(!v)throw Error(msg)};
const eq=(a,b,msg)=>ok(canonical(a)===canonical(b),msg);
const log=s=>{out.textContent+='\n'+s};
const call=(cmd,args={})=>invoke('r4_'+cmd,args);
const uuid=()=>crypto.randomUUID();
const stats=a=>{a.sort((x,y)=>x-y);return {n:a.length,p50:a[Math.floor(a.length/2)],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)}};
const stateOf=v=>JSON.parse(v.store[K]);
async function verify(state,revision){
 const v=await call('load');eq(stateOf(v),state,'independent native export differs');ok(v.revision===revision,'revision');
 ok(await snapshotFingerprint(v.store[K])===v.fingerprint,'raw fingerprint');
 const journal=await readConsistentHistory({flush:async()=>true,getItem:()=>v.store[K]},state,()=>call('journal'));
 ok(journal.intact&&journal.workspaceFingerprint===v.fingerprint,'history handshake');
 return {v,journal};
}
function edit(state,fn){return applyWorkspaceEdit(state,fn,{id:uuid(),at:new Date().toISOString(),source:'manual',session:'r4-webview',trigger:'event'},{allowAutomation:false,rules:[]})}
async function main(){
 let v=await call('load');
 if(v){
  const s=stateOf(v),audit=await verify(s,v.revision);
  ok(s.tasks.some(t=>t.id==='qa-0'&&t.title==='后续人工修改'),'restart retained later edit');
  if(v.phase==='fast'){
   const session=createCaptureSession(s),capture=[],ipc=[],native=[],start=performance.now();let rev=v.revision;
   const ops=[
    {kind:'create',id:'qa-r4-fast',title:'R4 typed create',listId:'inbox'},
    {kind:'batch',edits:[{id:'qa-200',priority:3,title:'R4 batch'},{id:'qa-201',priority:2}]},
    {kind:'reorder',from:'qa-r4-fast',to:'qa-200'},
    {kind:'complete',id:'qa-201',day:'2026-11-26'},
    {kind:'reopen',id:'qa-201'},
    {kind:'parent',id:'qa-r4-fast',parentId:'qa-200'},
    {kind:'tag',id:'qa-r4-fast',tagId:'qa-r4-fast-tag',name:'R4 合成标签'}
   ];
   for(let i=0;i<60;i++)ops.push({kind:'batch',edits:[{id:'qa-'+(300+i),priority:3}]});
   for(let i=0;i<ops.length;i++){
    const before=session.state,ts=performance.now(),r=session.apply(ops[i]);const cap=performance.now()-ts;
    ok(r.kind==='delta','typed capture delta');
    if(i<7||i%10===9){eq(plan(before,r.state).patch,r.patch,'typed capture oracle');eq(replay(before,r.patch),r.state,'typed replay');}
    const envelope={scope,base:rev,id:uuid(),patch:{...r.patch,keys:[]},receipt:null};
    const t=performance.now(),ack=await call('commit',{envelope});const elapsed=performance.now()-t;
    ok(ack.revision===rev+1&&ack.id===envelope.id&&ack.scope===scope,'typed ack');rev++;
    if(i>=7){capture.push(cap);ipc.push(elapsed);native.push(ack.nativeMs);}
    if(i<7||i%10===9)await verify(r.state,rev);
   }
   const done=await verify(session.state,rev),checkpoint=await call('checkpoint');
   const report={startRevision:v.revision,revision:rev,taskCount:session.state.tasks.length,typedOps:7,editorCapture:stats(capture),ipc:stats(ipc),native:stats(native),elapsedMs:performance.now()-start,checkpoint,fingerprint:done.v.fingerprint};
   await call('report',{phase:'fast',report});log(JSON.stringify(report,null,2));return;
  }
  const checkpoint=await call('checkpoint');
  await call('report',{phase:'restart' ,report:{revision:v.revision,taskCount:s.tasks.length,history:audit.journal.head,checkpoint,fingerprint:v.fingerprint}});
  log('重启校验通过');return;
 }
 let s={...initialState(),tasks:Array.from({length:10000},(_,i)=>newTask('synthetic '+i,'inbox','','qa-'+i))};
 s.tasks[1]={...s.tasks[1],repeat:'daily',repeatCount:3,date:'2026-11-27'};
 s.tasks[2]={...s.tasks[2],points:5};
 s.tasks[3]={...s.tasks[3],notes:'合成 Unicode 🚀、引号"、换行\n'};
 migrateState(s);v=await call('seed',{state:s});let rev=v.revision;
 const checks=[],timings=[],native=[],capture=[];
 async function commit(next,{fault=null,receipt=null,full=false,expectedFail=false,oracle=true}={}){
  const t=performance.now(),p=plan(s,next);ok(p.kind!=='reject',p.reason);
  if(!full)ok(p.kind==='delta','delta required');
  if(p.kind==='delta')eq(replay(s,p.patch),next,'JS independent replay');
  const envelope={scope,base:rev,id:uuid(),patch:full?{kind:'snapshot',store:{...v.store,[K]:JSON.stringify(next)}}:{...p.patch,keys:[]},receipt};
  capture.push(performance.now()-t);
  let ack;
  if(fault){
   try{await call('commit',{envelope,fault});throw Error('fault not raised')}catch(e){ok(String(e).includes(fault==='before'?'injected failure':'response lost'),'expected injected fault: '+e)}
   if(fault==='before')await verify(s,rev);
   else await verify(next,rev+1);
   if(expectedFail)return;
  }
  const start=performance.now();ack=await call('commit',{envelope});
  timings.push(performance.now()-start);native.push(ack.nativeMs);
  ok(ack.id===envelope.id&&ack.scope===scope&&ack.revision===rev+1,'ack identity');
  s=next;rev=ack.revision;
  if(oracle){const checked=await verify(s,rev);v=checked.v;ok(v.fingerprint===ack.fingerprint,'ack fingerprint');}
  return ack;
 }
 await verify(s,rev);
 await commit(edit(s,d=>({...d,tasks:[...d.tasks,newTask('合成新增','inbox','','qa-added')]})));checks.push('create');
 await commit(edit(s,d=>({...d,tasks:d.tasks.map(t=>['qa-0','qa-3'].includes(t.id)?{...t,priority:3}:t)})),{fault:'before'});checks.push('batch + rollback retry');
 await commit(edit(s,d=>({...d,tasks:reorderTasks(d.tasks,'qa-added','qa-0')})));checks.push('reorder');
 await commit(edit(s,d=>({...d,tasks:completeTask(d.tasks,'qa-2','2026-11-26')})));checks.push('complete');
 await commit(edit(s,d=>({...d,tasks:reopenTask(d.tasks,'qa-2')})));checks.push('reopen');
 await commit(edit(s,d=>({...d,tasks:completeTask(d.tasks,'qa-1','2026-11-27')})));checks.push('recurrence');
 const generated=s.tasks.find(t=>t.previousId==='qa-1');ok(generated,'next repeat');
 await commit(edit(s,d=>({...d,tasks:seriesPatch(d.tasks,generated.id,{interval:2})})));checks.push('series');
 await commit(edit(s,d=>({...d,tasks:d.tasks.map(t=>t.id==='qa-4'?{...t,parentId:'qa-0'}:t),tags:[{id:'qa-tag',name:'synthetic',color:'#777777'}]})));checks.push('relation + metadata');
 const base=s,local=edit(s,d=>({...d,tasks:d.tasks.map(t=>t.id==='qa-5'?{...t,priority:2}:t)})),remote=edit(s,d=>({...d,tasks:d.tasks.map(t=>t.id==='qa-6'?{...t,title:'remote synthetic'}:t)}));
 const merged=mergeTasks(base,local,remote);ok(merged,'merge');await commit(merged,{full:true});checks.push('merge + explicit full fallback');
 ok(v.store['todo-cloud-base']==='opaque qa','opaque sync metadata retained');
 // Exercise actual persisted CLI preview and apply against Rust history.
 const editId=uuid();await call('enqueue',{id:editId,request:{op:'update',id:'qa-7',fields:{priority:3}}});
 await commit(edit(s,d=>({...d,tasks:d.tasks.map(t=>t.id==='qa-7'?{...t,priority:3}:t)})),{receipt:{id:editId,status:'saved',result:{affected:1}}});
 const journal=await call('journal');const previewId=uuid(),applyId=uuid(),req={op:'history-preview',version:journal.head};
 await call('enqueue',{id:previewId,request:req});
 const preview=await prepareHistory(s,req,previewId,new Date(),{journal,reference:null});
 ok(preview.result.rows.length===1,'preview row');
 await commit(s,{receipt:{id:previewId,status:'saved',result:preview.result}});
 const applyReq={op:'history-apply',previewId,confirm:true};await call('enqueue',{id:applyId,request:applyReq});
 const applied=await prepareHistory(s,applyReq,applyId,new Date(),{journal:await call('journal'),reference:{id:previewId,kind:'history-preview',status:'saved',result:preview.result}});
 const next=edit(s,()=>applied.next);
 const receipt={id:applyId,status:'saved',result:{...applied.result,userConfirmation:{method:'desktop-modal',at:new Date().toISOString()}}};
 // Confirmation is synthetic test data, not a real user action.
 await commit(next,{receipt,fault:'lost'});
 ok(s.tasks.find(t=>t.id==='qa-7').priority===0,'history restored');
 ok((await call('receipt',{id:applyId})).status==='saved','history receipt');checks.push('formal history preview/apply + lost ACK');
 // Real IPC queue: failure after commit, retry same envelope, manual coalescing.
 let lost=false,attempts=[];
 const queue=createDeltaQueue(scope,s,rev,async envelope=>{
  attempts.push(JSON.stringify(envelope));
  if(!lost){lost=true;return call('commit',{envelope,fault:'lost'})}
  return call('commit',{envelope});
 });
 const a=edit(s,d=>({...d,tasks:d.tasks.map(t=>t.id==='qa-8'?{...t,priority:1}:t)}));
 queue.stage(a);ok(!await queue.flush(),'lost response expected');
 const b=edit(a,d=>({...d,tasks:d.tasks.map(t=>t.id==='qa-8'?{...t,priority:2}:t)}));
 const c=edit(b,d=>({...d,tasks:d.tasks.map(t=>t.id==='qa-0'?{...t,title:'后续人工修改'}:t)}));
 queue.stage(b);queue.stage(c);ok(await queue.flush(),'queue retry');
 ok(attempts.length===3&&attempts[0]===attempts[1],'same request retry');
 s=queue.state();rev=queue.getStatus().revision;v=(await verify(s,rev)).v;checks.push('real IPC queue coalescing');
 const perf=[],nativePerf=[],capturePerf=[];
 // Actual WebView to Rust: each edit uses shared editor and full R2 planner.
 for(let i=10;i<40;i++){
  const begin=performance.now(),next=edit(s,d=>({...d,tasks:d.tasks.map(t=>t.id==='qa-'+i?{...t,priority:3}:t)}));
  const p=plan(s,next);ok(p.kind==='delta','perf delta');capturePerf.push(performance.now()-begin);
  const envelope={scope,base:rev,id:uuid(),patch:{...p.patch,keys:[]},receipt:null};
  const start=performance.now(),ack=await call('commit',{envelope});perf.push(performance.now()-start);nativePerf.push(ack.nativeMs);
  ok(ack.revision===rev+1&&ack.id===envelope.id,'perf ack');s=next;rev++;
  if(i%10===9)await verify(s,rev);
 }
 v=(await verify(s,rev)).v;
 const cp=await call('checkpoint');
 const report={revision:rev,taskCount:s.tasks.length,checks,ipc:stats(perf),native:stats(nativePerf),editorCapture:stats(capturePerf),checkpoint:cp,historyApply:applyId,fingerprint:v.fingerprint,confirmation:'synthetic QA'};
 await call('report',{phase:'first',report});log(JSON.stringify(report,null,2));log('首轮通过，等待独立重启');
}
main().catch(async e=>{log(String(e));try{await call('report',{phase:'error',report:{error:String(e),stack:e.stack,output:out.textContent}})}catch{}});
