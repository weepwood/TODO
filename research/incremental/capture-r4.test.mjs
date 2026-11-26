import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState} from '../../src/core/domain.js';
import {createCaptureSession} from './capture.mjs';
import {plan,replay} from './changes.mjs';
test('controlled capture covers typed operations with independent replay and domain oracle',()=>{
 const initial={...initialState(),tasks:[newTask('one','inbox','','qa-1'),newTask('two','inbox','','qa-2')]};
 const s=createCaptureSession(initial);
 for(const op of [
  {kind:'create',id:'qa-3',title:'合成新增',listId:'inbox'},
  {kind:'batch',edits:[{id:'qa-1',title:'edited',priority:3},{id:'qa-2',priority:2}]},
  {kind:'reorder',from:'qa-3',to:'qa-1'},
  {kind:'complete',id:'qa-2',day:'2026-11-26'},
  {kind:'reopen',id:'qa-2'},
  {kind:'parent',id:'qa-3',parentId:'qa-1'},
  {kind:'tag',id:'qa-3',tagId:'qa-tag',name:'合成标签'}
 ]){
  const before=s.state,r=s.apply(op);
  assert.equal(r.kind,'delta');assert.deepEqual(r.patch,plan(before,r.state).patch);assert.deepEqual(replay(before,r.patch),r.state);migrateState(r.state);
 }
 const before=s.state;
 for(const op of [{kind:'parent',id:'qa-1',parentId:'qa-3'},{kind:'batch',edits:[{id:'qa-1',notes:'invalid'}]},{kind:'create',id:'qa-3',title:'duplicate',listId:'inbox'},{kind:'complete',id:'qa-1',day:'2026-02-31'},{kind:'batch',edits:[{id:'qa-1',priority:9}]}])assert.throws(()=>s.apply(op));
 assert.equal(s.state,before);
});
