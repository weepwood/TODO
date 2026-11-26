// Controlled research editor. No arbitrary callback crosses the fast boundary.
// Untrusted imports, automation, relation changes and external state still use R2.
import {migrateState} from '../../src/core/domain.js';
import {sealWorkspace} from '../../src/services/shard-state-plan.js';
import {applyWorkspaceEdit} from '../../src/components/useWorkspaceMutations.js';
import {diffSealed,plan} from './changes.mjs';
export function createCaptureSession(initial){
 migrateState(initial);sealWorkspace(initial);let state=initial;
 return {get state(){return state},priority(id,priority){
  if(!Number.isInteger(priority)||priority<0||priority>3||!state.tasks.some(t=>t.id===id))throw Error('invalid priority edit');
  const prior=state;const meta={id:crypto.randomUUID(),at:new Date().toISOString(),source:'manual',session:'r3-controlled',trigger:'event'};
  const next=applyWorkspaceEdit(prior,d=>({...d,tasks:d.tasks.map(t=>t.id===id?{...t,priority}:t)}),meta,{allowAutomation:false,rules:[]});
  const patch=diffSealed(prior,next);
  if(Buffer.byteLength(JSON.stringify(patch))>900000){migrateState(next);state=next;return {kind:'snapshot',state:next}}
  state=next;return {kind:'delta',patch,state:next};
 },external(next){
  const p=plan(state,next);if(p.kind!=='reject')state=next;return p;
 }};
}
