import assert from 'node:assert/strict';
import {initialState,newTask,migrateState} from '../../src/core/domain.js';
import {canonical} from '../../src/services/cloud-core.js';
import {createCaptureSession} from './capture.mjs';
import {plan,replay} from './changes.mjs';
const stats=a=>{a.sort((x,y)=>x-y);return [a[Math.floor(a.length/2)],a[Math.ceil(a.length*.95)-1],a.at(-1)].map(n=>n.toFixed(3)).join('/')};
for(const n of [1000,10000]){
 const initial={...initialState(),tasks:Array.from({length:n},(_,i)=>newTask('synthetic '+i,'inbox','','qa-'+i))};
 const session=createCaptureSession(initial),fast=[],slow=[],bytes=[];
 assert.throws(()=>session.priority('qa-0',8));
 for(let i=0;i<30;i++){
  const before=session.state;const t=performance.now();
  const p=session.priority('qa-'+i,3);
  fast.push(performance.now()-t);assert.equal(p.kind,'delta');
  const now=performance.now();const checked=plan(before,p.state);slow.push(performance.now()-now);
  assert.equal(checked.kind,'delta');assert.equal(canonical(checked.patch),canonical(p.patch));assert.deepEqual(replay(before,p.patch),p.state);migrateState(p.state);
  bytes.push(Buffer.byteLength(JSON.stringify(p.patch)));
 }
 console.log('capture tasks='+n+' samples=30 controlled_editor_and_capture_ms='+stats(fast)+' independent_r2_plan_ms='+stats(slow)+' patch_bytes='+stats(bytes));
}
