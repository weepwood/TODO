import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../src/core/domain.js';
import {reviewPeriod,buildReview,reviewMarkdown,pinFirst,undoOrdinaryCompletion} from '../src/core/task-review.js';
test('每日与周一开始的自然周，当前周截至今天',()=>{
 assert.deepEqual(reviewPeriod('2026-11-25','2026-11-25',true),{since:'2026-11-23',until:'2026-11-25'});
 assert.deepEqual(reviewPeriod('2026-11-20','2026-11-25',true),{since:'2026-11-16',until:'2026-11-22'});
 assert.deepEqual(reviewPeriod('2026-11-30','2026-11-25'),{since:'2026-11-25',until:'2026-11-25'});
});
test('回顾按完成日期、计划日期、专注开始及习惯日期分别统计，不修改数据',()=>{
 const d=initialState(),date='2026-11-25',done=date+'T12:00:00';
 d.tasks=[{...newTask('A *标题*','inbox','2026-11-24'),status:'completed',completedAt:done,points:8},{...newTask('负分','inbox',date),status:'completed',completedAt:done,points:-3},{...newTask('待办','inbox',date),time:'10:00',duration:45},{...newTask('重叠','inbox',date),time:'10:15',duration:30},{...newTask('积压','inbox','2026-11-23')},{...newTask('已删除','inbox',date),status:'completed',completedAt:done,deletedAt:done,points:100}];
 d.sessions=[{startedAt:done,seconds:1800,mode:'focus'},{startedAt:done,seconds:600,mode:'stopwatch'},{startedAt:done,seconds:900,mode:'break'}];d.habits=[{id:'h',name:'阅读',days:[date,date]}];
 const before=JSON.stringify(d),r=buildReview(d,reviewPeriod(date,date));
 assert.equal(r.completed.length,2);assert.equal(r.plannedMinutes,105);assert.equal(r.focusMinutes,40);assert.equal(r.points,5);assert.equal(r.habitCount,1);assert.equal(r.conflictCount,2);assert.equal(r.overdue.length,1);assert.equal(JSON.stringify(d),before);
 assert.match(reviewMarkdown(r),/净任务积分：\+5/);assert(!reviewMarkdown(r).includes('已删除'));assert(reviewMarkdown(r).includes('A \\*标题\\*'));
});
test('置顶稳定排序仅影响待办；撤销单次完成不覆盖其他编辑并保留进行中状态',()=>{
 const a=newTask('a'),b=newTask('b'),c={...newTask('c'),status:'completed',completedAt:'2026-11-25T12:00:00Z',stage:'done'};
 const tasks=[a,b,c];assert.deepEqual(pinFirst(tasks,[b.id,c.id]).map(t=>t.id),[b.id,a.id,c.id]);
 const receipt={id:c.id,completedAt:c.completedAt,stage:'doing'};
 const result=undoOrdinaryCompletion(tasks,receipt);assert.equal(result[2].stage,'doing');assert.equal(result[2].completedAt,null);assert.equal(result[0],a);
 assert.equal(undoOrdinaryCompletion(tasks,{...receipt,completedAt:'stale'}),tasks);
 const recurring=[a,b,{...c,repeat:'daily'}];assert.equal(undoOrdinaryCompletion(recurring,receipt),recurring);
 const linked=[{...a,status:'completed',dependsOn:[c.id]},b,c];assert.equal(undoOrdinaryCompletion(linked,receipt),linked);
});
