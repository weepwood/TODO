import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductStore} from './product-store.mjs';
import {initialState,newTask,STORAGE_KEY} from '../../src/core/domain.js';
import {canonical} from '../../src/services/cloud-core.js';
import {snapshotFingerprint} from '../../src/core/operation-history.js';
import {prepareSyncSnapshot} from '../../src/services/sync-durability.js';
import {replay} from './changes.mjs';
test('row adapter retries identical envelope and retains metadata; sync uses exact writer bytes',async()=>{
 globalThis.window={};
 let state={...initialState(),tasks:[newTask('synthetic','inbox','','qa-1')]},rev=0,meta={},attempts=[],last;
 const initial={[STORAGE_KEY]:canonical(state),'todo-cloud-meta':'original'};
 const invoke=async(cmd,args)=>{
  if(cmd==='r5_handshake')return {protocol:1,scope:'guest',mode:'row',revision:0};
  const e=args.envelope;attempts.push(JSON.stringify(e));
  if(last?.id===e.id)return last;
  assert.equal(e.base,rev);state=replay(state,e.patch);for(const x of e.patch.keys)meta[x.key]=x.after;
  last={id:e.id,scope:'guest',revision:++rev,fingerprint:await snapshotFingerprint(canonical(state))};
  if(rev===1)throw Error('lost');
  return last;
 };
 const s=await createProductStore(initial,'guest',()=>{},invoke);
 const next={...state,tasks:state.tasks.map(t=>({...t,title:'changed'}))};
 s.setItem(STORAGE_KEY,JSON.stringify(next));
 assert.equal(await s.flush(),false);
 s.setItem('todo-cloud-meta','new');
 assert.equal(await s.flush(),true);
 assert.equal(attempts[0],attempts[1]);assert.equal(rev,2);assert.equal(meta['todo-cloud-meta'],'new');
 assert.equal(await prepareSyncSnapshot(s,next,()=>true),true);
 assert.equal(await prepareSyncSnapshot(s,{...next,theme:'other'},()=>true),false);
 delete globalThis.window;
});
test('handshake rejects unknown protocol and foreign scope',async()=>{
 await assert.rejects(()=>createProductStore({},'guest',()=>{},async()=>({protocol:2,scope:'guest',mode:'row'})));
 await assert.rejects(()=>createProductStore({},'other',()=>{},async()=>({protocol:1,scope:'guest',mode:'row'})));
});
