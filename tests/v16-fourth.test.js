import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {initialState,newTask} from '../src/core/domain.js';
import {sameRecord} from '../src/core/record-equality.js';
import {backupTaskChanges,previewContentRestore,applyContentRestore} from '../src/core/backup-selection.js';
import {previewBulkProperties,applyBulkProperties,appendCapture,workspaceDiff,noteDraftKey} from '../src/core/professional-workflow.js';
import {appendTemplateInstance,changeTemplate,templateTask} from '../src/core/task-workflow.js';
import {listDrafts} from '../src/core/draft-directory.js';
import {resizeContinuation} from '../src/core/timeline-layout.js';
import {isReminderNavigation,reminderActionTypes} from '../src/platform/notification-action.js';
import {previewSeriesBatch} from '../src/core/series-control.js';
const date='2026-11-27',task=(id,fields={})=>({...newTask(id,'inbox',date,id),...fields}),base=tasks=>({...initialState(),tasks});
test('备份结构比较不受字段顺序影响，保留数组顺序和可选字段语义',()=>{
 const a={x:[{z:1,y:null}],missing:undefined},b={x:[{y:null,z:1}]};assert(sameRecord(a,b));assert(!sameRecord(a,{x:[{y:1,z:null}]}));assert(!sameRecord([1,2],[2,1]));
 const t=task('a'),d=base([t]),copy=structuredClone(d);assert.equal(backupTaskChanges(d,copy).length,0);assert.equal(workspaceDiff(d,copy)[0].unchanged,1);
 copy.tasks[0].notes='new';assert.deepEqual(backupTaskChanges(d,copy)[0].fields,['notes']);
});
test('选择性内容恢复只改变普通待办的明确字段，陈旧/异源/重复历史拒绝',()=>{
 const a=task('a',{notes:'当前',planLocked:true,planMinutes:40,time:'09:00'}),b=task('b',{repeat:'daily'}),c=task('c',{status:'completed',completedAt:new Date().toISOString()});
 const d=base([a,b,c]),backup=base([{...a,notes:'旧备注',title:'旧标题',priority:3,date:'2026-11-30',planMinutes:90},{...b,notes:'不恢复'},{...c,notes:'不恢复'},task('new')]);
 const ids=['a','b','c','new'],rows=previewContentRestore(d,backup,ids);assert.equal(rows.length,1);
 const next=applyContentRestore(d,backup,ids,rows);assert.equal(next.tasks[0].notes,'旧备注');assert.equal(next.tasks[0].date,date);assert.equal(next.tasks[0].planMinutes,40);assert.equal(next.tasks[0].planLocked,true);assert.equal(next.tasks[1],b);assert.equal(next.tasks[2],c);assert.equal(next.tasks.length,3);
 const stale=base([{...a,notes:'并发编辑'},b,c]);assert.equal(applyContentRestore(stale,backup,ids,rows),stale);
 assert.equal(previewContentRestore(d,base([{...a,createdAt:'2020-01-01',notes:'别的任务'}]),['a']).length,0);
 assert.equal(previewContentRestore(d,backup,['a','a']).length,0);
});
test('批量操作及模板生命周期提交复核，拒绝重复ID与已删除模板',()=>{
 const tasks=Array.from({length:101},(_,i)=>task(String(i))),d=base(tasks);
 assert.equal(previewBulkProperties(d,tasks.map(t=>t.id),{priority:3}).length,0);assert.equal(previewBulkProperties(d,['0','0'],{priority:3}).length,0);
 const duplicate=task('fresh');assert.equal(appendCapture(d,[duplicate,duplicate]),d);assert.equal(previewSeriesBatch([tasks[0]],['0','0'],'pause').length,0);
 const template={id:'template',name:'源模板',task:tasks[0]},state={...d,templates:[template]},instance=templateTask(template,state,{listId:'inbox',title:'实例',date});
 assert.equal(appendTemplateInstance(state,template,instance).tasks.length,102);assert.equal(appendTemplateInstance(d,template,instance),d);
 const changed={...state,templates:[{...template,task:{...template.task,notes:'变更'}}]};assert.equal(appendTemplateInstance(changed,template,instance),changed);assert.equal(changeTemplate(changed,template,null),changed);assert.equal(changeTemplate(state,template,'新名').templates[0].name,'新名');
});
test('本机草稿额外字段不能覆盖作用域内的任务身份或有效性',()=>{
 const key=noteDraftKey('a'),value=JSON.stringify({base:'原文',text:'草稿',at:new Date().toISOString(),id:'other',status:'current',title:'伪造'});
 const storage={length:1,key:()=>key,getItem:()=>value};const rows=listDrafts(storage,[task('a',{notes:'更新'})]);assert.equal(rows[0].id,'a');assert.equal(rows[0].status,'stale');assert.equal(rows[0].title,'a');
});
test('次日延续片段调整只改变总长度，不缩掉前一天的占位',()=>{
 assert.equal(resizeContinuation(90,60,15),105);assert.equal(resizeContinuation(90,60,-200),31);assert.equal(resizeContinuation(1440,90,15),1440);
});
test('真实时区：23/25小时实际轴、重复小时分别布局，保留偏移',()=>{
 const script=`import assert from 'node:assert/strict';import {elapsedDay,elapsedDayBlocks} from './src/core/day-timeline.js';import {calendarBusy} from './src/core/productivity.js';
 assert.equal(elapsedDay('2026-03-08').minutes,1380);assert.equal(elapsedDay('2026-11-01').minutes,1500);
 const rows=elapsedDayBlocks(calendarBusy([{id:'a',title:'第一小时',start:'2026-11-01T01:15:00-04:00',end:'2026-11-01T01:45:00-04:00'},{id:'b',title:'第二小时',start:'2026-11-01T01:15:00-05:00',end:'2026-11-01T01:45:00-05:00'}]),'2026-11-01');
 assert.equal(rows.length,2);assert.equal(rows[0].startMinute,75);assert.equal(rows[1].startMinute,135);assert.notEqual(rows[0].displayStart,rows[1].displayStart);assert(rows.every(r=>r.columns===1));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TZ:'America/New_York'},encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
test('系统通知动作仅导航，不接受其他动作或隐式点击',()=>{
 assert(isReminderNavigation({actionId:'todo-open-reminders'}));assert(!isReminderNavigation({actionId:'tap'}));assert(!isReminderNavigation({actionId:'complete'}));assert(!isReminderNavigation(null));assert.deepEqual(Object.keys(reminderActionTypes()[0]).sort(),['actions','id']);
});
import {taskBuckets} from '../src/core/task-list-interaction.js';
import {taskConflicts} from '../src/core/advanced.js';
test('分组保持原顺序与空分组，日期分组线性聚合，冲突按当日实际区间裁剪',()=>{
 const a=task('a',{time:'23:00',duration:120,sectionId:'s'}),b=task('b',{time:'23:30',duration:15}),list={id:'inbox',name:'收集箱',sections:[{id:'s',name:'一'},{id:'empty',name:'二'}]};
 assert.deepEqual(taskBuckets([a,b],'section',list,'',[list]).map(r=>r.items.map(t=>t.id)),[['a'],[],['b']]);
 assert.deepEqual(taskBuckets([a,b],'date',null,'',[list])[0].items,[a,b]);
 const clipStart=+new Date('2026-11-28T00:00:00'),clipEnd=+new Date('2026-11-29T00:00:00');
 assert(taskConflicts([a,b]).has('a'));assert.equal(taskConflicts([a,b],{clipStart,clipEnd}).size,0);
});
