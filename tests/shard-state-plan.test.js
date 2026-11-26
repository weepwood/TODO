import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY,dayKey} from '../src/domain.js';
import {bucket,splitSnapshot,diffParts} from '../src/services/web-workspace-shards.js';
import {planStateParts,createStateQueue} from '../src/services/shard-state-plan.js';
import {readSwitch,setSwitch,assertLegacyWriter,assertShardWriter,SWITCH_KEY,requireCompatibleWorker} from '../src/services/storage-switch-protocol.js';
import {prepareAccountChange} from '../src/services/sync-durability.js';
const fixture=()=>({...initialState(),tasks:Array.from({length:1000},(_,i)=>newTask('task '+i,'inbox',dayKey(),'task-'+i))});
test('分片引用复用与完整重算一致，重排、增删不遗漏',()=>{
 const state=fixture(),keys={[BACKUP_KEY]:'preserved'},first=planStateParts(state,keys,bucket);
 const next={...state,tasks:state.tasks.map((t,i)=>i===123?{...t,title:'changed'}:t)};
 const second=planStateParts(next,keys,bucket,first);
 assert.equal(second.serialized,1);assert.equal(second.reused,first.groups.size-1);
 assert.deepEqual(diffParts(second.parts,splitSnapshot({...keys,[STORAGE_KEY]:JSON.stringify(next)})),{put:[],remove:[]});
 const third={...next,tasks:[...next.tasks.slice(1).reverse(),newTask('new','inbox',dayKey(),'new')]};
 const last=planStateParts(third,keys,bucket,second);
 assert.deepEqual(diffParts(last.parts,splitSnapshot({...keys,[STORAGE_KEY]:JSON.stringify(third)})),{put:[],remove:[]});
});
test('连续修改合并、无主快照序列化、失败保留草稿及按需重试',async()=>{
 const a=fixture(),b={...a,theme:'dark'},c={...b,tasks:[...b.tasks,newTask('new')]},writes=[];
 let fail=true;
 const store=createStateQueue({[STORAGE_KEY]:JSON.stringify(a),[BACKUP_KEY]:'old',[BACKUP_KEY+'-at']:'1000'},async(s)=>{if(fail)throw Error('disk');writes.push(s)},()=>{},()=>2000);
 store.stageWorkspace(b);store.stageWorkspace(c);assert.equal(await store.flush(),false);assert.equal(store.diagnostics().fullSerializations,0);
 fail=false;assert.equal(await store.flush(),true);assert.deepEqual(writes,[c]);assert.equal(store.diagnostics().fullSerializations,0);
 assert.equal(JSON.parse(store.getItem(STORAGE_KEY)).tasks.length,1001);assert.equal(store.diagnostics().fullSerializations,1);
});
test('完整备份到期才序列化，保留原始快照与后续编辑',async()=>{
 const a=fixture(),b={...a,theme:'dark'};let written;
 const store=createStateQueue({[STORAGE_KEY]:JSON.stringify(a)},async(s,k)=>written={s,k},()=>{},()=>4000000);
 store.stageWorkspace(b);assert.equal(await store.flush(),true);assert.equal(written.k[BACKUP_KEY],JSON.stringify(a));assert.equal(written.k[BACKUP_KEY+'-at'],'4000000');
 assert.equal(store.getItem(STORAGE_KEY),JSON.stringify(b));
});
test('切换状态单调且未知版本拒绝写入',()=>{
 const m=new Map(),s={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)},hash='a'.repeat(64);
 assert.doesNotThrow(()=>assertLegacyWriter(s));setSwitch(s,'preparing',hash);assert.throws(()=>assertLegacyWriter(s));assert.throws(()=>assertShardWriter(s,hash));setSwitch(s,'active',hash);assert.doesNotThrow(()=>assertShardWriter(s,hash));setSwitch(s,'retired',hash);assert.throws(()=>setSwitch(s,'active',hash));assert.throws(()=>assertShardWriter(s,hash));m.set(SWITCH_KEY,JSON.stringify({...readSwitch(s),version:2}));assert.throws(()=>readSwitch(s),/不兼容/);
});
test('账户变更租约等待本地事务，失败释放而不继续认证',async()=>{
 let releases=0;const pause=async()=>()=>releases++;
 await assert.rejects(prepareAccountChange(pause,{flush:async()=>false}),/尚未提交/);assert.equal(releases,1);
 const release=await prepareAccountChange(pause,{flush:async()=>true});assert.equal(releases,1);release();assert.equal(releases,2);
});

test('PWA 协议拒绝未知、legacy 与等待更新中的不兼容工作线程',async()=>{
 const worker=answer=>({postMessage(_message,ports){ports[0].postMessage(answer)}});
 const current=worker({mode:'shard-pilot',version:1}),legacy=worker({mode:'legacy',version:1});
 await requireCompatibleWorker({getRegistration:async()=>null});
 await requireCompatibleWorker({controller:current,getRegistration:async()=>({active:current})});
 await assert.rejects(requireCompatibleWorker({controller:current,getRegistration:async()=>({waiting:legacy})}),/不兼容/);
 await assert.rejects(requireCompatibleWorker({controller:{postMessage(){}},getRegistration:async()=>null},10),/不兼容/);
});
