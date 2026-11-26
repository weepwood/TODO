import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../../src/core/domain.js';
import {createDeltaQueue} from './queue-r3.mjs';
import {replay} from './changes.mjs';
test('delta envelope remains identical after committed-but-lost response; receipt barrier survives coalescing',async()=>{
 const initial={...initialState(),tasks:[newTask('synthetic','inbox','','qa')]};
 const a={...initial,tasks:initial.tasks.map(t=>({...t,priority:1}))};
 const b={...a,tasks:a.tasks.map(t=>({...t,priority:2}))};
 const c={...b,tasks:b.tasks.map(t=>({...t,title:'later manual'}))};
 let current=initial,revision=0,lost=false,wrongAck=false;const saved=new Map(),calls=[];
 const q=createDeltaQueue('guest',initial,0,async envelope=>{
  const text=JSON.stringify(envelope);calls.push(text);
  if(saved.has(envelope.id)){assert.equal(saved.get(envelope.id).text,text);return saved.get(envelope.id).ack;}
  assert.equal(envelope.base,revision);current=replay(current,envelope.patch);revision++;
  const ack={scope:'guest',id:envelope.id,revision};saved.set(envelope.id,{text,ack});
  if(!lost){lost=true;throw Error('lost ACK after commit')}
  if(!wrongAck){wrongAck=true;return {...ack,scope:'wrong'}}
  return ack;
 });
 q.stage(a,{id:'qa-cli',status:'saved',result:{}});
 assert.equal(await q.flush(),false);
 q.stage(b);q.stage(c);
 assert.equal(await q.flush(),false);assert.equal(await q.flush(),true);
 assert.equal(calls.length,4);assert.equal(calls[0],calls[1]);assert.equal(calls[2],calls[3]);
 assert.equal(JSON.parse(calls[0]).receipt.id,'qa-cli');assert.equal(JSON.parse(calls[2]).receipt,null);
 assert.equal(revision,2);assert.deepEqual(current,c);assert.deepEqual(q.state(),c);assert.equal(q.getStatus().pending,false);
});
