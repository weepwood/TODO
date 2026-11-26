import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialState,newTask,completeTask,reopenTask,reorderTasks,seriesPatch,moveTaskToList} from '../../src/core/domain.js';
import {applyWorkspaceEdit} from '../../src/components/useWorkspaceMutations.js';
import {mergeTasks} from '../../src/services/sync-merge.js';
import {plan,replay} from './changes.mjs';
import {createNativeStore} from '../../src/services/native-store.js';
const key='todo-workbench-v1',stamp='2026-11-26T08:00:00.000Z';
let state={...initialState(),tasks:[newTask('ordinary','inbox','','a'),newTask('repeat','inbox','2026-11-27','r'),newTask('child','inbox','','c')]};
state.tasks[1]={...state.tasks[1],repeat:'daily',repeatCount:3};
state.tasks[2]={...state.tasks[2],parentId:'a'};
const base=state,steps=[];let seq=0;
function step(name,fn){
 const next=applyWorkspaceEdit(state,fn,{id:'qa-'+(++seq),at:stamp,source:'manual',session:'qa',trigger:'event'},{allowAutomation:false,rules:[]});
 const p=plan(state,next);assert.equal(p.kind,'delta',name);assert.deepEqual(replay(state,p.patch),next);
 steps.push({name,patch:p.patch,state:next});state=next;
}
step('create',d=>({...d,tasks:[...d.tasks,{...newTask('new synthetic','inbox','','b'),points:5}]}));
step('edit',d=>({...d,tasks:d.tasks.map(t=>t.id==='a'?{...t,priority:3,title:'updated'}:t)}));
step('reorder',d=>({...d,tasks:reorderTasks(d.tasks,'b','a')}));
step('move',d=>moveTaskToList(d,'b','work'));
step('complete ordinary',d=>({...d,tasks:completeTask(d.tasks,'b','2026-11-26')}));
step('reopen ordinary',d=>({...d,tasks:reopenTask(d.tasks,'b')}));
step('repeat completion',d=>({...d,tasks:completeTask(d.tasks,'r','2026-11-27')}));
step('repeat update',d=>({...d,tasks:seriesPatch(d.tasks,d.tasks.find(t=>t.previousId==='r').id,{interval:2})}));
step('trash',d=>({...d,tasks:d.tasks.map(t=>t.id==='c'?{...t,deletedAt:stamp}:t)}));
step('purge fixture only',d=>({...d,tasks:d.tasks.filter(t=>t.id!=='c')}));
step('cross entity',d=>({...d,tags:[{id:'qa-tag',name:'synthetic',color:'#777777'}],tasks:d.tasks.map(t=>t.id==='a'?{...t,tags:['qa-tag']}:t),theme:'dark'}));
const mergeBase=state;
const local={...state,tasks:state.tasks.map(t=>t.id==='a'?{...t,priority:2}:t)},remote={...state,tasks:state.tasks.map(t=>t.id==='a'?{...t,title:'remote synthetic'}:t)};
const merged=mergeTasks(state,local,remote);assert(merged);
step('three way merged',()=>merged);
assert.equal(mergeTasks(mergeBase,local,{...mergeBase,tasks:mergeBase.tasks.map(t=>t.id==='a'?{...t,priority:1}:t)}),null);
assert.equal(plan(base,state,1).kind,'snapshot');
assert.equal(plan(base,{...state,tasks:state.tasks.map(t=>({...t,priority:NaN}))}).kind,'reject');
assert.equal(plan(base,{...state,tasks:[...state.tasks,state.tasks[0]]}).kind,'reject');
// Actual production native queue used with experimental callback: failed write
// retries exact barrier; later manual edits cannot overtake receipt.
let committed=base,calls=[],failed=false;
const storage=createNativeStore({[key]:JSON.stringify(base)},async values=>{
 const next=JSON.parse(values[key]);const p=plan(committed,next);assert.equal(p.kind,'delta');assert.deepEqual(replay(committed,p.patch),next);calls.push('manual');committed=next;
},()=>{},async(values,receipt)=>{
 calls.push(receipt.id);if(!failed){failed=true;throw Error('injected write failure')}
 const next=JSON.parse(values[key]);const p=plan(committed,next);assert.equal(p.kind,'delta');assert.deepEqual(replay(committed,p.patch),next);committed=next;
});
storage.stageCliWorkspace(steps[0].state,{id:'qa-receipt'});assert.equal(await storage.flush(),false);
storage.setItem(key,JSON.stringify(steps[1].state));assert.equal(await storage.flush(),true);
assert.deepEqual(calls,['qa-receipt','qa-receipt','manual']);assert.deepEqual(committed,steps[1].state);
fs.writeFileSync(process.argv[2],JSON.stringify({base,steps}));
console.log('domain steps='+steps.length+' queue='+calls.join(',')+' fallback and conflict verified');
