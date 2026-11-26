// Isolated delta transport contract, not actual IPC registration.
// Trusted editor owns staged state; untrusted imports use full R2 plan.
// Receipt barriers and a failed in-flight envelope are never coalesced.
import {plan} from './changes.mjs';
import {sealWorkspace} from '../../src/services/shard-state-plan.js';
import {migrateState} from '../../src/core/domain.js';
export function createDeltaQueue(scope,initial,revision,send){
 migrateState(initial);sealWorkspace(initial);
 let committed=initial,rev=revision,queue=[],inflight=null,running=null,error='';
 function stage(next,receipt=null){
  const p=plan(queue.at(-1)?.state??inflight?.state??committed,next);
  if(p.kind!=='delta')throw Error(p.reason||'explicit full-store fallback required');
  const job={state:next,receipt:receipt?structuredClone(receipt):null};
  if(queue.length&&!receipt&&!queue.at(-1).receipt)queue[queue.length-1]=job;
  else queue.push(job);
 }
 async function drain(){
  error='';
  try{
   while(inflight||queue.length){
    if(!inflight){
     const job=queue[0];
     const p=plan(committed,job.state);
     if(p.kind==='reject')throw Error(p.reason);
     const patch=p.kind==='delta'?{...p.patch,keys:[]}:{kind:'snapshot',store:{'todo-workbench-v1':JSON.stringify(job.state)}};
     // This demo queue only handles the state key. No implicit metadata deletion.
     if(p.kind==='snapshot')throw Error('explicit full-store export required');
     const envelope=sealWorkspace({scope,base:rev,id:crypto.randomUUID(),patch,receipt:job.receipt});
     inflight={state:job.state,envelope};queue.shift();
    }
    const envelope=inflight.envelope;
    const ack=await send(envelope);
    if(ack.scope!==scope||ack.id!==envelope.id||ack.revision!==rev+1)throw Error('invalid acknowledgement');
    committed=inflight.state;rev=ack.revision;inflight=null;
   }
   return true;
  }catch(e){error=String(e);return false;}
 }
 return {stage,flush(){
  if(!running){running=drain().finally(()=>running=null)}
  return running;
 },getStatus:()=>({revision:rev,pending:!!inflight||!!queue.length,error}),
 state:()=>committed};
}
