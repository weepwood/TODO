import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,completeTask,reconcile,migrateState,seriesPatch} from '../src/core/domain.js';
import {seriesControl,protectHeldRules} from '../src/core/series-control.js';
import {seriesOverview} from '../src/core/task-lifecycle.js';
import {buildTaskDelta,applyTaskDelta} from '../src/services/task-delta.js';
import {mergeTasks} from '../src/services/sync-merge.js';
import {previewRules,applyRules,readRules,writeRules} from '../src/core/workflow-rules.js';
import {reviewTrend,previousComparablePeriod,reviewMetricValues} from '../src/core/review-visual.js';
import {buildReview} from '../src/core/task-review.js';
import {saveSnapshot,readSnapshots} from '../src/core/archive-review.js';
const today='2026-11-25';
test('暂停系列使用旧客户端兼容次数围栏，恢复原规则，结束保留当前历史',()=>{
 const a={...newTask('重复','inbox','2026-11-24'),repeat:'daily',miss:'skip',repeatCount:9,points:5};
 const tasks=[a],paused=seriesControl(tasks,a.id,'pause'),p=paused[0];
 assert.deepEqual(p.seriesHold,{count:9,miss:'skip'});assert.equal(p.repeatCount,1);assert.equal(p.miss,'keep');
 assert.equal(completeTask(paused,a.id,today),paused);assert.equal(reconcile(paused,today),paused);
 assert.equal(seriesOverview(paused,a.id,today).next,null);assert.deepEqual(protectHeldRules(p,{repeat:'none',date:'',notes:'编辑'}),{notes:'编辑'});
 assert.equal(seriesPatch(paused,a.id,{repeat:'none'})[0],p);
 const resumed=seriesControl(paused,a.id,'resume');assert.equal(resumed[0].repeatCount,9);assert.equal(resumed[0].miss,'skip');
 const ended=seriesControl(paused,a.id,'end');assert.equal(ended[0].seriesHold,null);
 const completed=completeTask(ended,a.id,today);assert.equal(completed.length,1);assert.equal(completed[0].status,'completed');assert.equal(completed[0].points,5);
 // Old client has no pause metadata, but respects the stored count fence.
 const legacy=[{...p,seriesHold:null}];assert.equal(completeTask(legacy,a.id,today).length,1);
 assert.equal(seriesControl([p,{...p,id:'later',seriesId:a.id,occurrenceIndex:2}],a.id,'resume')[0],p);
 assert.equal(seriesControl([{...p,repeatCount:3}],a.id,'resume')[0].repeatCount,3);
});
test('暂停记录经过迁移和同步增量保留，结构性并发拒绝自动合并',()=>{
 const base=initialState();base.tasks=[{...newTask('重复','inbox',today),repeat:'daily'}];
 const next={...base,tasks:seriesControl(base.tasks,base.tasks[0].id,'pause')};
 assert.deepEqual(migrateState(next).tasks[0].seriesHold,{count:0,miss:'keep'});
 const delta=buildTaskDelta(base,next);assert(delta);assert.deepEqual(applyTaskDelta(base,delta),next);
 assert.equal(mergeTasks(base,next,{...base,tasks:[{...base.tasks[0],title:'并发编辑'}]}),null);
});
test('自动化首个有效字段优先、预览过期拒绝、普通待办限定与幂等',()=>{
 const data=initialState(),a={...newTask('积压','work','2026-11-24'),points:7,reminderAt:'2026-11-24T09:00'},b={...a,id:'repeat',repeat:'daily'},c=newTask('其他','personal',today);
 data.tasks=[a,b,c];
 const rule=(id,action)=>({id,name:id,list:'work',condition:'overdue',action,enabled:true});
 const rules=[rule('a','tomorrow'),rule('b','today'),rule('c','high')],rows=previewRules(data,rules,today);
 assert.equal(rows.length,1);assert.deepEqual(rows[0].patch,{date:'2026-11-26',anchor:26,priority:3});
 const next=applyRules(data,rows,rules,today);assert.equal(next.tasks[0].points,7);assert.equal(next.tasks[0].reminderAt,a.reminderAt);assert.equal(next.tasks[1],b);assert.equal(previewRules(next,rules,today).length,0);
 const stale={...data,tasks:[{...a,title:'新标题'},b,c]};assert.equal(applyRules(stale,rows,rules,today),stale);
 let raw=null;const storage={getItem:()=>raw,setItem:(k,v)=>{raw=v}};assert.equal(readRules(storage).auto,false);writeRules(storage,{rules,auto:true,lastRun:today});assert.equal(readRules(storage).lastRun,today);
});
test('回顾按实际日期统计正负积分和专注，部分周同天数比较，快照不随源变化',()=>{
 const data=initialState(),a={...newTask('完成','inbox','2026-11-24'),status:'completed',completedAt:today+'T12:00:00',points:-3};
 data.tasks=[a];data.sessions=[{startedAt:today+'T09:00:00',mode:'focus',seconds:1200},{startedAt:today+'T10:00:00',mode:'break',seconds:600}];
 const period={since:'2026-11-23',until:today},trend=reviewTrend(data,period);
 assert.deepEqual(trend.at(-1),{date:today,completed:1,points:-3,focusMinutes:20});
 assert.deepEqual(previousComparablePeriod(period,true),{since:'2026-11-16',until:'2026-11-18'});
 let raw=null;const storage={getItem:()=>raw,setItem:(k,v)=>{raw=v}};
 const r=buildReview(data,period),visual={metrics:reviewMetricValues(r),trend};
 saveSnapshot(storage,r,'week',new Date(today+'T12:00:00'),visual);data.tasks=[];
 assert.equal(readSnapshots(storage)[0].visual.metrics.completed,1);assert.equal(readSnapshots(storage)[0].visual.trend.at(-1).points,-3);
});
