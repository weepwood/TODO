import assert from 'node:assert/strict';
import {initialState,newTask} from '../../src/core/domain.js';
import {applyWorkspaceEdit} from '../../src/components/useWorkspaceMutations.js';
import {plan,replay} from './changes.mjs';
const stats=a=>{a.sort((x,y)=>x-y);return [a[Math.floor(a.length/2)],a[Math.ceil(a.length*.95)-1],a.at(-1)].map(n=>n.toFixed(3)).join('/')};
for(const n of [1000,10000]){
 let base={...initialState(),tasks:Array.from({length:n},(_,i)=>({...newTask('synthetic '+i,'inbox','','qa-'+i),createdAt:'2026-11-26T08:00:00.000Z'}))};
 const times=[],serialize=[],bytes=[],snapshot=[];
 for(let i=0;i<20;i++){
  const next=applyWorkspaceEdit(base,d=>({...d,tasks:d.tasks.map((t,j)=>i===j?{...t,priority:3}:t)}),{id:'bench-'+i,at:'2026-11-26T08:00:00.000Z',source:'manual',session:'qa'},{allowAutomation:false,rules:[]});
  let t=performance.now();const p=plan(base,next);times.push(performance.now()-t);assert.equal(p.kind,'delta');
  assert.deepEqual(replay(base,p.patch),next);bytes.push(Buffer.byteLength(JSON.stringify(p.patch)));
  t=performance.now();const full=JSON.stringify(next);serialize.push(performance.now()-t);snapshot.push(Buffer.byteLength(full));base=next;
 }
 console.log('js tasks='+n+' samples=20 plan_ms='+stats(times)+' serialize_ms='+stats(serialize)+' patch_bytes='+stats(bytes)+' snapshot_bytes='+stats(snapshot));
}
