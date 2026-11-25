import test from 'node:test';
import assert from 'node:assert/strict';
import {newTask} from '../src/core/domain.js';
import {scheduleSnapshot,scheduleChanges,reminderBefore} from '../src/core/task-schedule.js';
test('安排草稿原子差异保留非安排字段及独立提醒',()=>{
 const t={...newTask('测试','inbox','2027-01-15'),reminderAt:'2027-01-14T09:00',remindedAt:'sent'};
 const draft={...scheduleSnapshot(t),date:'2027-02-20',time:'10:00'};
 assert.deepEqual(scheduleChanges(t,{...t,title:'其他编辑'},draft).fields,{date:'2027-02-20',time:'10:00',anchor:20});
 assert.equal(t.date,'2027-01-15');assert.equal(t.reminderAt,'2027-01-14T09:00');
 assert.ok(scheduleChanges(t,{...t,time:'08:00'},draft).error);
 assert.ok(scheduleChanges(t,{...t,status:'completed'},draft).error);
});
test('重复保护、期限与起始日期',()=>{
 const t=newTask('测试','inbox','2027-01-15'),draft={...scheduleSnapshot(t),date:'2027-02-20',repeat:'weekly'};
 assert.equal(scheduleChanges(t,t,draft).fields.seriesStart,'2027-02-20');
 assert.ok(scheduleChanges(t,t,{...draft,repeatUntil:'2027-01-15'}).error);
 assert.ok(scheduleChanges(t,t,draft,{locked:true}).error);
 const recurring={...t,repeat:'daily'};
 assert.ok(scheduleChanges(recurring,recurring,{...scheduleSnapshot(recurring),date:'',repeat:'none'}).error);
});
test('提前提醒跨日换算与无效输入拒绝',()=>{
 assert.equal(reminderBefore('2027-01-15','00:05',15),'2027-01-14T23:50');
 assert.equal(reminderBefore('2027-01-15','10:00',5),'2027-01-15T09:55');
 assert.equal(reminderBefore('2027-02-30','10:00',5),'');
 assert.equal(reminderBefore('2027-01-15','',5),'');
});
