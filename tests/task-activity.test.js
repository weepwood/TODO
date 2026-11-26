import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState,completeTask} from '../src/core/domain.js';
import {recordTaskChanges,recordAttachment,mergeActivity,validActivity,displayActivity,ACTIVITY_LIMIT,ACTIVITY_BYTES} from '../src/core/task-activity.js';
import {historyReducer} from '../src/history.js';
import {mergeTasks} from '../src/services/sync-merge.js';
import {buildTaskDelta,applyTaskDelta} from '../src/services/task-delta.js';
const meta=(n,source='manual',session='test')=>({id:'op-'+n,at:new Date(Date.UTC(2026,10,26,3,0,n)).toISOString(),source,session});
const base=()=>({...initialState(),tasks:[{...newTask('原名称','inbox','2026-11-26'),createdAt:'2026-11-25T00:00:00.000Z'}]});
const patch=(s,fields)=>({...s,tasks:[{...s.tasks[0],...fields},...s.tasks.slice(1)]});
const change=(s,fields,n,source,session)=>recordTaskChanges(s,patch(s,fields),meta(n,source,session));
test('真实差异一次操作记录多属性，原任务不变，重载兼容',()=>{
 const s=base(),next=change(s,{title:'daily',date:'2026-11-27',priority:3},1);
 assert.equal(s.tasks[0].activity,undefined);const e=next.tasks[0].activity[0];
 assert.equal(e.label,'更新任务属性');assert.equal(e.changes.find(c=>c.field==='title').after,'daily');
 assert.equal(e.changes.find(c=>c.field==='priority').after,'高优先级');
 assert.equal(recordTaskChanges(next,patch(next,{title:'daily'}),meta(2)).tasks[0].activity.length,1);
 assert.deepEqual(migrateState(JSON.parse(JSON.stringify(next))).tasks[0].activity,next.tasks[0].activity);
 assert.equal(displayActivity(s.tasks[0]).length,1);
});
test('备注连续合并而不保存正文，跨会话不合并，提醒送达不生成修改',()=>{
 const s=base(),a=change(s,{notes:'敏感备注'},1),b=change(a,{notes:'另一个内容'},2);
 assert.equal(b.tasks[0].activity.length,1);assert.equal(b.tasks[0].activity[0].changes[0].before,'无备注');
 assert.ok(!JSON.stringify(b.tasks[0].activity).includes('敏感备注'));
 const c=change(b,{notes:'另一个内容2'},3,'manual','other');assert.equal(c.tasks[0].activity.length,2);
 const d=change(c,{remindedAt:meta(4).at},4);assert.deepEqual(d.tasks[0].activity,c.tasks[0].activity);
});
test('撤销重做追加真实逆向事件；重复新实例不继承父历史',()=>{
 const s=base(),a=change(s,{title:'更新'},1),state={data:a,past:[s],future:[]};
 const undo=historyReducer(state,{type:'undo',meta:meta(2,'undo')});
 assert.equal(undo.data.tasks[0].title,'原名称');assert.equal(undo.data.tasks[0].activity.length,2);
 const redo=historyReducer(undo,{type:'redo',meta:meta(3,'redo')});assert.equal(redo.data.tasks[0].activity.length,3);
 const r=change(redo.data,{repeat:'daily'},4),completed=recordTaskChanges(r,{...r,tasks:completeTask(r.tasks,r.tasks[0].id,'2026-11-26')},meta(5));
 assert.equal(completed.tasks.length,2);assert.ok(completed.tasks[1].activity.every(e=>['created','generated'].includes(e.kind)));
 assert.equal(displayActivity(completed.tasks[0]).filter(e=>e.kind==='completed').length,1);
});
test('并发安全字段合并活动去重，不放宽原业务冲突规则，delta 保留事件',()=>{
 const s=base(),a=change(s,{title:'左'},1),b=change(s,{priority:2},2);
 const m=mergeTasks(s,a,b);assert.equal(m.tasks[0].activity.length,2);
 assert.equal(mergeActivity(m.tasks[0].activity,m.tasks[0].activity).length,2);
 assert.equal(mergeTasks(s,a,change(s,{title:'右'},3)),null);
 assert.deepEqual(mergeTasks(s,a,a).tasks[0].activity,a.tasks[0].activity);
 const large={...s,tasks:[...s.tasks,...Array.from({length:20},(_,i)=>newTask('任务'+i))]},next=change(large,{title:'新名称'},4);
 assert.deepEqual(applyTaskDelta(large,buildTaskDelta(large,next)),next);
});
test('容量、附件成功记录及历史字段兼容',()=>{
 let s=base();for(let i=1;i<=ACTIVITY_LIMIT+20;i++)s=change(s,{title:'修改'+i},i);
 const t=s.tasks[0];assert.equal(t.activity.length,ACTIVITY_LIMIT);assert.equal(t.activity[0].changes[0].after,'修改21');assert.ok(validActivity(t.activity));assert.ok(new TextEncoder().encode(JSON.stringify(t.activity)).length<=ACTIVITY_BYTES);
 const a=recordAttachment(s,t.id,'attachmentAdded',meta(ACTIVITY_LIMIT+21));assert.equal(a.tasks[0].activity.at(-1).source,'device');
 assert.equal(recordAttachment(a,'missing','attachmentRemoved',meta(ACTIVITY_LIMIT+22)),a);
 assert.throws(()=>migrateState(patch(s,{activity:[{id:'bad'}]})),/活动记录/);
});
test('详情标题在同一焦点会话合并，独立标题提交仍各自记录',()=>{
 const s=base(),a=change(s,{title:'修改中'},1,'manual','title:focus1'),b=change(a,{title:'最终名称'},2,'manual','title:focus1');
 assert.equal(b.tasks[0].activity.length,1);assert.equal(b.tasks[0].activity[0].changes[0].before,'原名称');assert.equal(b.tasks[0].activity[0].changes[0].after,'最终名称');
 const c=change(b,{title:'再次修改'},3);assert.equal(c.tasks[0].activity.length,2);
});
test('扩容后兼容旧40条，长文本多字节容量限制保留最新记录',()=>{
 const s=base(),t=s.tasks[0],seed=change(s,{title:'记录'},1).tasks[0].activity[0];
 const old=Array.from({length:40},(_,i)=>({...seed,id:'old-'+i,at:meta(i).at}));
 assert.deepEqual(migrateState(patch(s,{activity:old})).tasks[0].activity,old);
 const large=Array.from({length:ACTIVITY_LIMIT},(_,i)=>({...seed,id:'large-'+i,at:meta(i).at,changes:[{field:'title',label:'修改名称',before:'甲'.repeat(160),after:'乙'.repeat(160)}]}));
 const retained=mergeActivity(large);
 assert.ok(retained.length>40&&retained.length<ACTIVITY_LIMIT);
 assert.equal(retained.at(-1).id,'large-'+(ACTIVITY_LIMIT-1));
 assert.ok(validActivity(retained));
 assert.deepEqual(mergeActivity(retained,retained),retained);
 assert.ok(!validActivity(large));
});
