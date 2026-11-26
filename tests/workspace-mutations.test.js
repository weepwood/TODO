import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,STORAGE_KEY} from '../src/domain.js';
import {historyReducer} from '../src/history.js';
import {createWorkspaceEditor,createWorkspacePersister} from '../src/components/useWorkspaceMutations.js';
test('隔离编辑回调保持活动语义及30步撤销窗口',()=>{
 const task=newTask('初始','inbox','','closure-task');
 let state={data:{...initialState(),tasks:[task]},past:[],future:[]};
 const edit=createWorkspaceEditor((value,source,record)=>{
  assert.equal(source,'manual');assert.equal(record,false);
  state=historyReducer(state,{type:'edit',value,record});
 },{session:'isolation-session',allowAutomation:false,rules:[]});
 for(let i=1;i<=42;i++)edit(d=>({...d,tasks:d.tasks.map(t=>({...t,title:'修改 '+i}))}));
 assert.equal(state.data.tasks[0].title,'修改 42');
 assert.equal(state.past.length,30);
 assert.equal(state.past[0].tasks[0].title,'修改 12');
 assert.equal(state.data.tasks[0].activity.length,42);
 const meta={id:'undo-proof',at:new Date().toISOString(),source:'undo',session:'isolation-session'};
 state=historyReducer(state,{type:'undo',meta});
 assert.equal(state.data.tasks[0].title,'修改 41');
 assert.equal(state.data.tasks[0].activity.length,43);
});
test('隔离保存回调保留同步、异步草稿及失败边界',()=>{
 const data=initialState(),draft={current:{current:data,staged:null}},errors=[];
 const store=new Map(),legacy={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 const report=e=>errors.push(e);
 assert.equal(createWorkspacePersister(legacy,data,true,draft,report)(),false);assert.equal(store.size,0);
 assert.equal(createWorkspacePersister(legacy,data,false,draft,report)(),true);
 assert.equal(JSON.parse(store.get(STORAGE_KEY)).version,data.version);assert.equal(draft.current.staged,data);
 const changed={...data,theme:'dark'};let staged;
 assert.equal(createWorkspacePersister({stageWorkspace:d=>staged=d},changed,false,draft,report)(),true);
 assert.equal(staged,changed);assert.equal(draft.current.staged,changed);
 const failed={...changed,theme:'light'};
 assert.equal(createWorkspacePersister({stageWorkspace(){throw Object.assign(Error('quota'),{name:'QuotaExceededError'})}},failed,false,draft,report)(),false);
 assert.equal(draft.current.staged,changed);assert.match(errors.at(-1),/存储空间不足/);
});
