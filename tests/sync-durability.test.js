import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,STORAGE_KEY} from '../src/domain.js';
import {createNativeStore} from '../src/services/native-store.js';
import {prepareSyncSnapshot,requireCommittedStorage,assertCloudCapacity} from '../src/services/sync-durability.js';
test('异步同步不得发布尚未进入存储镜像的数据',async()=>{
 const a=initialState(),b={...a,theme:'dark'};let writes=0;
 const s=createNativeStore({[STORAGE_KEY]:JSON.stringify(a)},async()=>writes++);
 assert.equal(await prepareSyncSnapshot(s,b,()=>true),false);assert.equal(writes,0);
 s.setItem(STORAGE_KEY,JSON.stringify(b));assert.equal(await prepareSyncSnapshot(s,b,()=>true),true);assert.equal(writes,1);
});
test('异步提交失败不能确认同步，重试后才能继续',async()=>{
 const a=initialState(),b={...a,theme:'dark'};let fail=true;
 const s=createNativeStore({[STORAGE_KEY]:JSON.stringify(a)},async()=>{if(fail)throw Error('disk full')});
 s.setItem(STORAGE_KEY,JSON.stringify(b));await assert.rejects(requireCommittedStorage(s),/尚未提交/);
 assert.equal(s.getItem(STORAGE_KEY),JSON.stringify(b));fail=false;await requireCommittedStorage(s);assert.equal(s.getStatus().pending,false);
});
test('等待提交时出现更新或作用域离开则拒绝旧快照',async()=>{
 const a=initialState(),b={...a,theme:'dark'};let release,current=true;
 const s=createNativeStore({[STORAGE_KEY]:JSON.stringify(a)},()=>new Promise(r=>release=r));
 s.setItem(STORAGE_KEY,JSON.stringify(b));const result=prepareSyncSnapshot(s,b,()=>current);await Promise.resolve();current=false;release();assert.equal(await result,false);
});
test('云容量仍按 UTF-8 字节判定，不被本机扩容绕过',()=>{
 assert.ok(assertCloudCapacity({title:'中文'})>JSON.stringify({title:'中文'}).length);
 assert.throws(()=>assertCloudCapacity({notes:'汉'.repeat(1200000)}),/3.5 MB/);
});
