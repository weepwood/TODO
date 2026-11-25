import test from 'node:test';
import assert from 'node:assert/strict';
import {activityComparison,activityDay} from '../src/core/stats-drill.js';
import {initialState,newTask} from '../src/core/domain.js';
test('区间对照严格等长、跨月日期连续、零值保留',()=>{
 const rows=activityComparison('2026-03-03',7,{'2026-03-03':3,'2026-02-24':2});
 assert.equal(rows.length,7);assert.deepEqual(rows.at(-1),{date:'2026-03-03',previousDate:'2026-02-24',current:3,previous:2});assert.equal(rows[0].current,0);assert.equal(rows[0].previousDate,'2026-02-18');assert.deepEqual(activityComparison('bad',7,{}),[]);
});
test('日期明细按完成/专注开始日期与清单过滤，历史删除及休息排除',()=>{
 const d=initialState(),date='2026-11-25',a={...newTask('A','work',date),status:'completed',completedAt:date+'T12:00:00'},b={...a,id:'b',listId:'personal'},c={...a,id:'c',deletedAt:date+'T13:00:00'};
 d.tasks=[a,b,c];d.sessions=[{taskId:a.id,seconds:90,mode:'focus',startedAt:date+'T09:00:00'},{taskId:a.id,seconds:300,mode:'break',startedAt:date+'T10:00:00'},{taskId:'c',seconds:1800,mode:'focus',startedAt:date+'T11:00:00'}];
 assert.equal(activityDay(d,date,'work').tasks.length,1);assert.equal(activityDay(d,date,'work').focusMinutes,2);assert.equal(activityDay(d,date).focusMinutes,32);assert.equal(activityDay(d,date).sessions[1].title,'未绑定或已移除任务');
});
