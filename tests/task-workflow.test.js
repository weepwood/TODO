import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../src/core/domain.js';
import {templateTask,focusSetup,favoriteLists} from '../src/core/task-workflow.js';
test('模板创建保留内容和时长，重置历史、提醒、重复和依赖',()=>{
 const d=initialState(),old={...newTask('原任务','work','2026-11-25'),duration:90,time:'09:00',notes:'记录',priority:2,points:5,repeat:'daily',status:'completed',completedAt:'2026-11-25T10:00:00Z',reminderAt:'2026-11-25T08:00',dependsOn:['other'],checklist:[{id:'old',text:'步骤',done:true}]};
 const t=templateTask({task:old},d,{listId:'personal',title:'新任务',date:'2026-11-27'});
 assert.notEqual(t.id,old.id);assert.equal(t.duration,90);assert.equal(t.time,'09:00');assert.equal(t.points,5);
 assert.equal(t.listId,'personal');assert.equal(t.repeat,'none');assert.equal(t.status,'pending');assert.equal(t.completedAt,null);assert.equal(t.reminderAt,'');assert.deepEqual(t.dependsOn,[]);assert.notEqual(t.checklist[0].id,'old');assert.equal(t.checklist[0].done,false);
 assert.equal(templateTask({task:old},d,{listId:'missing',title:'新任务'}),null);
 assert.equal(templateTask({task:old},d,{listId:'work',title:'新任务'}).time,'');
});
test('专注预设限制分钟范围并排除历史；收藏不改变清单对象及文件夹',()=>{
 const d=initialState(),t={...newTask('任务'),duration:240};
 assert.deepEqual(focusSetup(t,d.focusConfig),{taskId:t.id,minutes:180});
 assert.deepEqual(focusSetup({...t,status:'completed'},d.focusConfig),{taskId:'',minutes:25});
 assert.deepEqual(favoriteLists(d.lists,['inbox','work','missing']),[d.lists[1]]);
 assert.equal(d.lists.length,3);
});
