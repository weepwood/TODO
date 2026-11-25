import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,duplicateTask,moveTaskToList} from '../src/domain.js';
test('复制任务创建独立待办并清除提醒与关系',()=>{
 const state=initialState();state.tags=[{id:'tag',name:'测试'}];
 const task={...newTask('原任务','work','2026-12-10'),notes:'备注',priority:2,time:'09:00',tags:['tag'],repeat:'weekly',seriesId:'series',parentId:'parent',dependsOn:['dependency'],reminderAt:'2026-12-10T08:30',extraReminders:[{id:'r',at:'2026-12-10T09:00',sentAt:null}],checklist:[{id:'old',text:'检查',done:true}]};
 const copy=duplicateTask(task,state.lists,state.tags);
 assert.notEqual(copy.id,task.id);assert.equal(copy.title,'原任务（副本）');assert.equal(copy.notes,'备注');assert.equal(copy.time,'09:00');assert.equal(copy.repeat,'none');assert.equal(copy.seriesId,null);assert.equal(copy.reminderAt,'');assert.deepEqual(copy.dependsOn,[]);assert.deepEqual(copy.extraReminders,[]);assert.equal(copy.parentId,null);assert.equal(copy.checklist[0].done,false);assert.notEqual(copy.checklist[0].id,'old');assert.equal(task.checklist[0].done,true);
 assert.equal(duplicateTask({...task,deletedAt:'x'},state.lists,state.tags),null);
});
test('跨清单移动校验目标分组并保留其他字段',()=>{
 const state=initialState();state.lists[1].sections=[{id:'s',name:'组'}];const task=newTask('任务','inbox','2026-12-10');state.tasks=[task];
 assert.equal(moveTaskToList(state,task.id,'work','bad'),state);
 const next=moveTaskToList(state,task.id,'work','s');assert.deepEqual(next.tasks[0],{...task,listId:'work',sectionId:'s'});
 assert.equal(moveTaskToList(next,task.id,'work','s'),next);
});
