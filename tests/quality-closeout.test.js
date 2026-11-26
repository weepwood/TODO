import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState} from '../src/core/domain.js';
import {blockPatch,editPlanSegments} from '../src/core/plan-block.js';
import {focusSecondsByTask,taskFocusSeconds} from '../src/core/pomodoro-planner.js';
import {todayExecution} from '../src/core/today-execution.js';
import {makeQueueRun} from '../src/core/focus-queue.js';
import {startQueueRun,settleFocus,changeFocusTimer,focusTimerKey} from '../src/core/focus-engine.js';
import {unsafeHistoryPull} from '../src/services/sync-merge.js';
import {canUndoRun,undoRun} from '../src/core/workflow-rules.js';
const date='2026-11-26',at=Date.parse(date+'T09:00:00'),iso=new Date(at).toISOString(),task=(id,fields={})=>({...newTask(id,'inbox',date,id),...fields}),base=(tasks=[])=>({...initialState(),tasks});
test('时间段编辑拒绝锁定及过期快照，锁定固化估计',()=>{
 const old=[{id:'s',date,time:'09:00',minutes:30}],t=task('a',{planSegments:old}),next=[{...old[0],minutes:45}];
 assert.deepEqual(editPlanSegments(t,old,next),{planSegments:next});
 assert.equal(editPlanSegments({...t,planLocked:true},old,next),null);
 assert.equal(editPlanSegments({...t,planSegments:next},old,next),null);
 assert.equal(editPlanSegments(t,old,[{...old[0],date:'1899-12-31'}]),null);
 assert.equal(blockPatch(t,{planLocked:true}).planMinutes,t.duration);
 assert.equal(blockPatch({...t,planLocked:true},{planSegments:next}),null);
});
test('自动化历史撤销不能绕过后来锁定的日期',()=>{
 const t=task('a',{planLocked:true,planMinutes:30,anchor:26}),run={id:'r',at:iso,trigger:'manual',changes:[{id:'a',title:'a',before:{date:'2026-11-25',anchor:25},after:{date,anchor:26}}]};
 const state={...base([t]),workflowRuns:[run]};assert.equal(canUndoRun(state,'r'),false);assert.equal(undoRun(state,'r'),state);
 assert(canUndoRun({...state,tasks:[{...t,planLocked:false}]},'r'));
});
test('新版会话旧端直接结束触发冲突，正常结束带回执通过',()=>{
 const d=base([task('a',{duration:2})]),run=makeQueueRun({items:[{id:'a'}]},d,120,'r'),s=startQueueRun(d,run,at);
 assert(unsafeHistoryPull(s,{...s,timer:null}));const done=settleFocus(s,at+120000);
 assert.equal(unsafeHistoryPull(s,done),false);assert.equal(done.queueHistory[0].actual,120);
 const paused=changeFocusTimer(s,{action:'pause',key:focusTimerKey(s.timer),now:at+60000});assert.equal(unsafeHistoryPull(s,paused),false);
});
test('专注聚合维持逐任务统计语义，今日纳入当日补充段',()=>{
 const sessions=[{taskId:'a',mode:'focus',seconds:60.7},{taskId:'a',mode:'stopwatch',seconds:20.8},{taskId:'a',mode:'break',seconds:100},{taskId:'b',mode:'focus',seconds:-3}];
 const sums=focusSecondsByTask(sessions);for(const id of ['a','b','c'])assert.equal(sums.get(id)||0,taskFocusSeconds(sessions,id));
 const d={...base([task('a',{date:'2026-11-27',planSegments:[{id:'s',date,time:'09:00',minutes:30}]})]),sessions};
 assert.equal(todayExecution(d,date,new Date(at)).items[0].remaining,1719);
});

test('旧锁定数据迁移固化占位，旧端保留锁字段却移动日期时拒绝拉取',()=>{
 const d=base([task('a',{planLocked:true,duration:42})]),m=migrateState(d),t=m.tasks[0];assert.equal(t.planMinutes,42);
 assert(unsafeHistoryPull(m,{...m,tasks:[{...t,date:'2026-11-27'}]}));
 assert(unsafeHistoryPull(m,{...m,tasks:[{...t,planMinutes:30}]}));
 assert.equal(unsafeHistoryPull(m,{...m,tasks:[{...t,duration:60}]}),false);
 assert.equal(unsafeHistoryPull(m,{...m,tasks:[{...t,planLocked:false,date:'2026-11-27'}]}),false);
});
test('连续队列预览过期拒绝启动，旧会话ID不可复用',()=>{
 const d=base([task('a',{duration:5})]),run=makeQueueRun({items:[{id:'a'}]},d,300,'r');
 const changed={...d,sessions:[{id:'s',taskId:'a',mode:'focus',seconds:60,startedAt:iso}]};
 assert.equal(startQueueRun(changed,run,at),changed);
 const changedEstimate={...d,tasks:[{...d.tasks[0],duration:6}]};assert.equal(startQueueRun(changedEstimate,run,at),changedEstimate);
 const s=startQueueRun(d,run,at),done=settleFocus(s,at+300000);assert.equal(startQueueRun(done,run,at+400000),done);
});
