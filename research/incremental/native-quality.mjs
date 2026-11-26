// Segmented isolated experiment. No real user data or production entrypoint.
// Timeouts are not cancellation: a timed-out commit is unknown, never reissued
// with a new ID. The queue retains its exact immutable envelope.
import {invoke} from '@tauri-apps/api/core';
import {initialState,newTask} from '../../src/core/domain.js';
import {applyWorkspaceEdit} from '../../src/components/useWorkspaceMutations.js';
import {snapshotFingerprint,readConsistentHistory} from '../../src/core/operation-history.js';
import {sameRecord} from '../../src/core/record-equality.js';
import {canonical} from '../../src/services/cloud-core.js';
import {createCaptureSession} from './capture.mjs';
import {plan,replay} from './changes.mjs';
import {createDeltaQueue} from './queue-r3.mjs';
const K='todo-workbench-v1',scope='guest';
const ok=(x,m)=>{if(!x)throw Error(m)};
const eq=(a,b,m)=>ok(sameRecord(a,b),m);
const uuid=()=>crypto.randomUUID();
const stats=a=>{const b=[...a].sort((x,y)=>x-y);return {n:b.length,p50:(b[(b.length-1)>>1]+b[b.length>>1])/2,p95:b[Math.ceil(b.length*.95)-1],max:b.at(-1)}};
async function call(cmd,args={}){
 let timer;
 try{return await Promise.race([invoke('r4_'+cmd,args),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('IPC timeout; outcome unknown: '+cmd)),20000))]);}
 finally{clearTimeout(timer)}
}
async function mark(stage,detail={}){await call('report',{phase:'progress',report:{stage,...detail}})}
async function verify(state,rev){
 await mark('audit-load',{rev});
 const v=await call('load');ok(v.revision===rev,'revision');eq(JSON.parse(v.store[K]),state,'export differs');
 await mark('audit-hash',{rev});
 ok(await snapshotFingerprint(v.store[K])===v.fingerprint,'raw fingerprint');
 const j=await readConsistentHistory({flush:async()=>true,getItem:()=>v.store[K]},state,()=>call('journal'));
 ok(j.intact&&j.workspaceFingerprint===v.fingerprint,'history handshake');
 await mark('audit-end',{rev,head:j.head});return {v,j};
}
function edit(state,fn){return applyWorkspaceEdit(state,fn,{id:uuid(),at:new Date().toISOString(),source:'manual',session:'r4-quality',trigger:'event'},{allowAutomation:false,rules:[]})}
function tick(){return new Promise(r=>setTimeout(r,10))}
async function send(state,rev,patch,receipt=null){
 const envelope={scope,base:rev,id:uuid(),patch:{...patch,keys:[]},receipt};
 const t=performance.now(),ack=await call('commit',{envelope});
 ok(ack.revision===rev+1&&ack.id===envelope.id&&ack.scope===scope&&/^[a-f0-9]{64}$/.test(ack.fingerprint),'ack');
 return {ack,ms:performance.now()-t}
}
async function quality(v){
 ok(v.revision===49,'quality requires preserved v49 copy');
 let state=JSON.parse(v.store[K]),rev=v.revision;
 await verify(state,rev);
 const session=createCaptureSession(state),ops=[
  {kind:'parent',id:'qa-r4-fast',parentId:'qa-200'},
  {kind:'tag',id:'qa-r4-fast',tagId:'qa-r4-fast-tag',name:'R4 合成标签'}
 ];
 for(const op of ops){
  await mark('typed-start',{kind:op.kind,rev});const before=session.state,r=session.apply(op);
  await mark('typed-captured',{kind:op.kind});ok(r.kind==='delta','delta');
  const oracle=plan(before,r.state);eq(r.patch,oracle.patch,'oracle patch');eq(replay(before,r.patch),r.state,'replay');
  await mark('typed-ipc',{kind:op.kind});const {ack}=await send(r.state,rev,r.patch);rev=ack.revision;
  await mark('typed-saved',{kind:op.kind,rev});await tick();
 }
 state=session.state;await verify(state,rev);
 const rid=uuid();await call('enqueue',{id:rid,request:{op:'update',id:'qa-700',fields:{priority:3}}});
 const receipt={id:rid,status:'saved',result:{affected:1}};
 let attempts=[],count=0;
 const queue=createDeltaQueue(scope,state,rev,async envelope=>{
  attempts.push(JSON.stringify(envelope));count++;
  await mark('queue-send',{count,id:envelope.id,base:envelope.base});
  return call('commit',{envelope,fault:count===1?'before':count===2?'lost':null});
 });
 const a=edit(state,d=>({...d,tasks:d.tasks.map(t=>t.id==='qa-700'?{...t,priority:3}:t)}));
 queue.stage(a,receipt);ok(!await queue.flush(),'before failure');
 ok((await call('receipt',{id:rid})).status==='received','pending after rollback');
 await verify(state,rev);
 const b=edit(a,d=>({...d,tasks:d.tasks.map(t=>t.id==='qa-701'?{...t,priority:2}:t)}));
 const c=edit(b,d=>({...d,tasks:d.tasks.map(t=>t.id==='qa-702'?{...t,priority:3}:t)}));
 queue.stage(b);queue.stage(c);
 ok(!await queue.flush(),'lost response');ok((await call('receipt',{id:rid})).status==='saved','receipt durable');
 await verify(a,rev+1);
 ok(await queue.flush(),'same envelope retry');
 ok(attempts.length===4&&attempts[0]===attempts[1]&&attempts[1]===attempts[2]&&JSON.parse(attempts[3]).receipt===null,'barrier and coalescing');
 state=queue.state();rev=queue.getStatus().revision;
 const final=await verify(state,rev);eq(state,c,'later edits retained');
 const checkpoint=await call('checkpoint');
 await call('report',{phase:'quality',report:{revision:rev,taskCount:state.tasks.length,history:final.j.head,fingerprint:final.v.fingerprint,typedOps:ops.map(x=>x.kind),receiptId:rid,queueAttempts:attempts.length,checkpoint}});
}
async function performanceRun(v){
 let rev=v.revision;const initialRev=rev;const session=createCaptureSession(JSON.parse(v.store[K]));
 const fast=[],slow=[],canonicalCost=[],ipc=[],native=[];
 // Same edited snapshots measured side-by-side, not an old-engine GUI comparison.
 for(let i=0;i<30;i++){
  await mark('perf-start',{i,rev});const before=session.state,t=performance.now(),r=session.priority('qa-'+(800+i),3);fast.push(performance.now()-t);
  ok(r.kind==='delta','perf delta');const a=performance.now(),oracle=plan(before,r.state);slow.push(performance.now()-a);
  eq(oracle.patch,r.patch,'independent patch');const b=performance.now();ok(canonical(replay(before,oracle.patch))===canonical(r.state),'canonical oracle');canonicalCost.push(performance.now()-b);
  const result=await send(r.state,rev,r.patch);rev=result.ack.revision;ipc.push(result.ms);native.push(result.ack.nativeMs);
  await mark('perf-end',{i,rev});if(i%10===9)await verify(r.state,rev);await tick();
 }
 const done=await verify(session.state,rev),checkpoint=await call('checkpoint');
 await call('report',{phase:'perf',report:{startRevision:initialRev,revision:rev,taskCount:session.state.tasks.length,fingerprint:done.v.fingerprint,fast:stats(fast),fullPlan:stats(slow),canonicalOracle:stats(canonicalCost),ipc:stats(ipc),native:stats(native),checkpoint}});
}
async function retention(v){
 // A lower-memory fixture, deliberately separate from the 10k comparison.
 if(v.empty){const s={...initialState(),tasks:Array.from({length:1000},(_,i)=>newTask('synthetic '+i,'inbox','','qa-'+i))};v=await call('seed',{state:s})}
 const session=createCaptureSession(JSON.parse(v.store[K]));let rev=v.revision,start=rev;
 ok(rev<=320,'unexpected retention revision');
 const end=Math.min(320,rev+80),samples=[],capture=[];
 for(let i=rev;i<end;i++){
  if(i%10===0)await mark('retention-start',{rev});
  const t=performance.now(),r=session.priority('qa-'+i,3);capture.push(performance.now()-t);ok(r.kind==='delta','delta');
  const result=await send(r.state,rev,r.patch);rev=result.ack.revision;samples.push(result.ms);
  if(rev%40===0){await verify(r.state,rev);await call('checkpoint')}
  await tick();
 }
 const done=await verify(session.state,rev),checkpoint=await call('checkpoint');
 await call('report',{phase:'retention',report:{start,revision:rev,history:done.j.head,entries:done.j.entries.length,taskCount:session.state.tasks.length,fingerprint:done.v.fingerprint,ipc:stats(samples),capture:stats(capture),checkpoint}});
}
export async function runQuality(v){
 await mark('phase-start',{phase:v.phase,rev:v.revision??null});
 if(v.phase==='quality')return quality(v);
 if(v.phase==='perf')return performanceRun(v);
 if(v.phase==='retention')return retention(v);
 throw Error('unknown phase')
}
