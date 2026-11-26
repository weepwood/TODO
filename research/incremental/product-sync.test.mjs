import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState} from '../../src/core/domain.js';
import {canonical,digest,decideSync} from '../../src/services/cloud-core.js';
import {buildTaskDelta,replayTaskDeltas} from '../../src/services/task-delta.js';
import {mergeTasks} from '../../src/services/sync-merge.js';
import {plan,replay} from './changes.mjs';
test('local row revision and remote revision remain separate; actual delta and merge semantics preserved',async()=>{
 const base={...initialState(),tasks:Array.from({length:20},(_,i)=>newTask('synthetic '+i,'inbox','','qa-'+i))};
 const local={...base,tasks:base.tasks.map(t=>t.id==='qa-1'?{...t,priority:3}:t)};
 const remote={...base,tasks:base.tasks.map(t=>t.id==='qa-2'?{...t,title:'remote'}:t)};
 const delta=buildTaskDelta(base,remote);assert.ok(delta);
 const response={revision:8,patches:[{from:7,to:8,tasks:delta}]};
 assert.equal(canonical(replayTaskDeltas(base,7,response)),canonical(remote));
 assert.equal(replayTaskDeltas(base,6,response),null);
 const merged=mergeTasks(base,local,remote);assert.ok(merged);migrateState(merged);
 assert.equal(merged.tasks.find(t=>t.id==='qa-1').priority,3);
 assert.equal(merged.tasks.find(t=>t.id==='qa-2').title,'remote');
 const p=plan(local,merged);assert.equal(p.kind,'delta');assert.equal(canonical(replay(local,p.patch)),canonical(merged));
 const sameField={...base,tasks:base.tasks.map(t=>t.id==='qa-1'?{...t,priority:1}:t)};
 assert.equal(mergeTasks(base,local,sameField),null);
 // The cloud remains a separate CAS protocol; local revision 83 is not remote revision 8.
 const meta={revision:7,hash:await digest(base)};
 assert.equal(decideSync({localHash:await digest(local),remoteHash:await digest(remote),remoteRevision:8,meta,emptyHash:await digest(initialState())}),'conflict');
 assert.equal(buildTaskDelta(base,{...remote,theme:'dark'}),null);
});
