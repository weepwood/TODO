import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../src/core/domain.js';
import {parseMarkdownTasks,inferMapping,previewExchange,makeImportTasks,appendImportedTasks} from '../src/core/task-exchange.js';
const state=(tasks=[])=>({...initialState(),tasks});
const preview=(raw,data)=>{const parsed=parseMarkdownTasks(raw,{tree:true});return previewExchange(parsed,inferMapping(parsed.header),'inbox',data)};
test('被拒绝父任务的子孙不占用后续有效独立任务的去重签名',()=>{
 const original=state([newTask('已有父任务','inbox','')]);
 const rows=preview('- [ ] 已有父任务\n  - [ ] 独立任务\n    - [ ] 后续任务\n- [ ] 独立任务\n- [ ] 后续任务\n- [ ] 独立任务',original);
 assert.deepEqual(rows.map(r=>[r.error,r.duplicate]),[['',true],['父任务不可导入',false],['父任务不可导入',false],['',false],['',false],['',true]]);
 const accepted=makeImportTasks(rows);assert.deepEqual(accepted.map(t=>t.title),['独立任务','后续任务']);assert(accepted.every(t=>t.parentId===null));
 const next=appendImportedTasks(original,accepted);assert.equal(next.tasks.length,3);assert.equal(next.tasks[0],original.tasks[0]);assert.equal(original.tasks.length,1);
});
test('正常父子关系及真实去重保持不变，非法前向父索引明确拒绝',()=>{
 const original=state(),rows=preview('- [ ] 父任务\n  - [ ] 子任务\n- [ ] 子任务',original);
 const tasks=makeImportTasks(rows);assert.equal(tasks.length,2);assert.equal(tasks[1].parentId,tasks[0].id);assert(rows[2].duplicate);
 const parsed={header:['title'],rows:[['错误引用'],['有效独立任务']],parents:[2,null]};
 const rejected=previewExchange(parsed,{title:0},'inbox',original);assert.equal(rejected[0].error,'父任务不可导入');assert.deepEqual(makeImportTasks(rejected).map(t=>t.title),['有效独立任务']);
});
