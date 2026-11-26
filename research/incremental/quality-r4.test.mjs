import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../../src/core/domain.js';
import {canonical} from '../../src/services/cloud-core.js';
import {plan,replay} from './changes.mjs';
import {createDeltaQueue} from './queue-r3.mjs';
test('structural comparison matches independent canonical replay, rejects invalid JSON',()=>{
 const init={...initialState(),tasks:Array.from({length:12},(_,i)=>newTask('task '+i,'inbox','','qa-'+i))};
 let state=init;
 for(let i=0;i<120;i++){
  const id='qa-'+i%12;
  const next={...state,tasks:state.tasks.map(t=>t.id===id?{...t,notes:i%2?'汉字🚀\n"':'',priority:i%4}:t)};
  const p=plan(state,next);assert.equal(p.kind,'delta');assert.equal(canonical(replay(state,p.patch)),canonical(next));state=next;
 }
 const clone=JSON.parse(JSON.stringify(state));
 clone.tasks=clone.tasks.map(t=>Object.fromEntries(Object.entries(t).reverse()));
 const p=plan(state,clone);assert.equal(p.kind,'delta');assert.equal(p.patch.put.length,0);
 assert.equal(plan(state,{...state,tasks:state.tasks.map(t=>({...t,notes:undefined}))}).kind,'reject');
});
test('cached exact patch retained across before-commit failure and lost response, later manual edits coalesce',async()=>{
 let state={...initialState(),tasks:[newTask('a','inbox','','qa-1'),newTask('b','inbox','','qa-2')]},rev=0;
 const change=(s,id,title)=>({...s,tasks:s.tasks.map(t=>t.id===id?{...t,title}:t)});
 const a=change(state,'qa-1','first'),b=change(a,'qa-2','later'),c=change(b,'qa-2','final');
 let envelopes=[],saved;
 const q=createDeltaQueue('guest',state,0,async e=>{
  envelopes.push(JSON.stringify(e));
  if(envelopes.length===1)throw Error('failed before commit');
  if(envelopes.length===3)return saved;
  assert.equal(e.base,rev);
  state=replay(state,e.patch);rev++;
  const ack={id:e.id,scope:'guest',revision:rev};
  if(envelopes.length===2){saved=ack;throw Error('lost response')}
  return ack;
 });
 q.stage(a,{id:'qa-receipt',status:'saved',result:{}});
 assert.equal(await q.flush(),false);q.stage(b);q.stage(c);
 assert.equal(await q.flush(),false);assert.equal(await q.flush(),true);
 assert.equal(envelopes.length,4);assert.equal(envelopes[0],envelopes[1]);assert.equal(envelopes[1],envelopes[2]);
 assert.equal(JSON.parse(envelopes[3]).receipt,null);assert.deepEqual(state,c);assert.equal(q.getStatus().revision,2);
});
