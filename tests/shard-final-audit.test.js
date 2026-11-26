import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY,dayKey} from '../src/domain.js';
import {bucket,splitSnapshot,joinSnapshot,diffParts} from '../src/services/web-workspace-shards.js';
import {planStateParts,createStateQueue,sealWorkspace} from '../src/services/shard-state-plan.js';
function rng(seed){let x=seed;return n=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)%n}}
function fixture(n){return {...initialState(),tasks:Array.from({length:n},(_,i)=>newTask('任务 '+i,'inbox',dayKey(),'audit-'+i))}}
test('引用复用必须拒绝原地修改，包括浅冻结与嵌套检查项',()=>{
 const state=fixture(2);state.tasks[0].checklist=[{id:'c',text:'before',done:false}];Object.freeze(state.tasks[0]);
 const plan=planStateParts(state,{},bucket);
 assert.throws(()=>{state.tasks[0].checklist[0].done=true},TypeError);
 assert.throws(()=>state.tasks.push(newTask('bad')),TypeError);
 const next={...state,tasks:state.tasks.map((t,i)=>i===0?{...t,checklist:t.checklist.map(c=>({...c,done:true}))}:t)};
 const updated=planStateParts(next,{},bucket,plan);assert.equal(updated.serialized,1);assert.deepEqual(JSON.parse(joinSnapshot(updated.parts)[STORAGE_KEY]),JSON.parse(JSON.stringify(next)));
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>sealWorkspace(cyclic),/循环/);assert.throws(()=>sealWorkspace({date:new Date()}),/非普通/);assert.throws(()=>sealWorkspace({get x(){return 1}}),/动态/);
});
test('固定种子随机操作与完整分片/重建独立差分',()=>{
 let cases=0;
 for(const seed of [1,19,314159,20261126,0xdeadbeef]){
  const r=rng(seed);let state=fixture(64),keys={},plan=null;
  for(let i=0;i<240;i++){
   let tasks=state.tasks;const op=r(7),j=r(tasks.length||1);
   if(op===0&&tasks.length)tasks=tasks.map((t,k)=>k===j?{...t,title:'修改 '+seed+' '+i,notes:'中文 '+i}:t);
   if(op===1)tasks=[...tasks,newTask('新增 '+i,'inbox',dayKey(),seed+'-new-'+i)];
   if(op===2&&tasks.length)tasks=tasks.filter((_,k)=>k!==j);
   if(op===3)tasks=[...tasks].reverse();
   if(op===4&&tasks.length)tasks=tasks.map((t,k)=>k===j?{...t,checklist:[{id:'ck-'+i,text:'检查项',done:!!r(2)}]}:t);
   if(op===5)keys={...keys,[BACKUP_KEY]:'snapshot-'+i};
   if(op===6)keys={};
   state={...state,tasks,theme:i%2?'dark':'light'};
   plan=planStateParts(state,keys,bucket,plan);
   const oracle=splitSnapshot({...keys,[STORAGE_KEY]:JSON.stringify(state)});
   assert.deepEqual(diffParts(plan.parts,oracle),{put:[],remove:[]},'seed '+seed+' step '+i);
   assert.deepEqual(JSON.parse(joinSnapshot(plan.parts)[STORAGE_KEY]),JSON.parse(JSON.stringify(state)));
   cases++;
  }
 }
 assert.equal(cases,1200);
});
test('在途提交后的编辑和元数据变化不可被旧快照确认',async()=>{
 const initial=fixture(3);let release,entered;const started=new Promise(r=>entered=r),writes=[];
 const store=createStateQueue({[STORAGE_KEY]:JSON.stringify(initial),[BACKUP_KEY]:'old',[BACKUP_KEY+'-at']:'1000'},async(state,keys)=>{writes.push({state,keys});if(writes.length===1){entered();await new Promise(r=>release=r)}},()=>{},()=>2000);
 const a={...initial,theme:'dark'};store.stageWorkspace(a);const first=store.flush();await started;
 const b={...a,tasks:[...a.tasks,newTask('later')]};store.stageWorkspace(b);store.setItem('todo-cloud-meta','later');const second=store.flush();
 assert.throws(()=>{a.tasks[0].title='illegal'},TypeError);
 release();assert.equal(await first,true);assert.equal(await second,true);assert.equal(writes.length,2);assert.equal(writes[1].keys['todo-cloud-meta'],'later');assert.deepEqual(writes[1].state,b);
});

test('私有初始及字符串导入延迟冻结，但写入回调只接收深冻结快照',async()=>{
 const a=fixture(2),b={...a,theme:'dark'},seen=[];
 const store=createStateQueue({[STORAGE_KEY]:JSON.stringify(a)},async(state,keys)=>{assert.equal(Object.isFrozen(state),true);assert.equal(Object.isFrozen(state.tasks[0].checklist),true);seen.push(state.theme)});
 store.setItem('todo-cloud-meta','metadata-only');assert.equal(await store.flush(),true);
 store.setItem(STORAGE_KEY,JSON.stringify(b));assert.equal(await store.flush(),true);assert.deepEqual(seen,[a.theme,'dark']);
});
