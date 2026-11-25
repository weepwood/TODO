import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,completeTask,reconcile,migrateState} from '../src/core/domain.js';
import {seriesControl,seriesDirectory,recoverSeries,unsafeSeriesPull} from '../src/core/series-control.js';
import {previewRules,recordRun,undoRun,eventRules,dueScheduledRules} from '../src/core/workflow-rules.js';
import {reviewPeriod,buildReview} from '../src/core/task-review.js';
import {makeVisual,previousComparablePeriod} from '../src/core/review-visual.js';
import {automaticSnapshot} from '../src/core/review-schedule.js';
import {readSnapshots} from '../src/core/archive-review.js';
import {buildTaskDelta} from '../src/services/task-delta.js';
import {mergeTasks} from '../src/services/sync-merge.js';
const today='2026-11-25',meta={id:'run',at:'2026-11-25T10:00:00Z',trigger:'manual'};
const rule=(patch={})=>({id:'rule',name:'规则',list:'all',condition:'any',action:'high',enabled:true,...patch});
test('AND/OR、标签及状态操作；执行回执与安全撤销同事务',()=>{
 const d=initialState(),a={...newTask('A','work',today),tags:['tag']},b=newTask('B','personal','2026-11-24');d.tasks=[a,b];
 const rules=[rule({condition:'today',extra:'overdue',match:'all',tag:'tag'})];assert.equal(previewRules(d,rules,today).length,0);
 rules[0]={...rules[0],match:'any',action:'doing'};const rows=previewRules(d,rules,today);assert.equal(rows.length,1);
 const next=recordRun(d,rows,rules,today,meta);assert.equal(next.tasks[0].stage,'doing');assert.equal(next.workflowRuns.length,1);assert.equal(migrateState(next).workflowRuns.length,1);
 const edited={...next,tasks:[{...next.tasks[0],title:'人工改名'},b]},undone=undoRun(edited,'run');assert.equal(undone.tasks[0].stage,'todo');assert.equal(undone.tasks[0].title,'人工改名');assert.equal(undone.workflowRuns[0].undone,true);
 assert.equal(undoRun({...next,tasks:[{...next.tasks[0],stage:'todo'},b]},'run').workflowRuns[0].undone,undefined);
 assert.equal(buildTaskDelta(d,next),null);assert.equal(mergeTasks(d,next,{...d,tasks:[{...a,title:'远程'},b]}),null);
});
test('创建、变更、前置完成触发仅处理目标；无级联',()=>{
 const d=initialState(),a=newTask('前置','inbox',today),b={...newTask('后续'),dependsOn:[a.id]};d.tasks=[a,b];
 const rules=[rule({trigger:'created',action:'tomorrow'}),rule({id:'changed',trigger:'changed',action:'doing'}),rule({id:'completed',trigger:'completed',action:'high',condition:'unblocked'})];
 const c=newTask('新任务'),after={...d,tasks:[...d.tasks,c]},created=eventRules(d,after,rules,today,meta);assert.equal(created.tasks[2].date,'2026-11-26');assert.equal(created.tasks[2].stage,'todo');
 const edited={...d,tasks:[{...a,title:'改名'},b]};assert.equal(eventRules(d,edited,rules,today,meta).tasks[0].stage,'doing');
 const completed={...d,tasks:completeTask(d.tasks,a.id,today)},result=eventRules(d,completed,rules,today,meta);assert.equal(result.tasks[1].priority,3);assert.equal(result.tasks[0].status,'completed');
});
test('指定时间与日期回执、周期快照去重和月末边界',()=>{
 const rules=[rule({trigger:'time',at:'10:30'}),rule({id:'daily',trigger:'daily'})];
 assert.deepEqual(dueScheduledRules(rules,new Date(today+'T10:00:00')).map(r=>r.id),['daily']);assert.deepEqual(dueScheduledRules(rules,new Date(today+'T11:00:00'),{daily:today}).map(r=>r.id),['rule']);
 const d=initialState(),store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 assert.equal(automaticSnapshot(storage,d,today,'month',new Date(today+'T21:00:00')),false);
 assert.equal(automaticSnapshot(storage,d,'2026-11-30','month',new Date('2026-11-30T21:00:00')),true);assert.equal(automaticSnapshot(storage,d,'2026-11-30','month',new Date('2026-11-30T22:00:00')),false);
 assert.equal(readSnapshots(storage)[0].visual.trend.length,30);
});
test('月度日期、时间分配和六个月趋势',()=>{
 const d=initialState(),a={...newTask('A','work',today),status:'completed',completedAt:today+'T12:00:00'};d.tasks=[a];d.sessions=[{taskId:a.id,mode:'focus',seconds:1800,startedAt:today+'T10:00:00'},{mode:'focus',seconds:600,startedAt:today+'T10:00:00'}];
 const p=reviewPeriod(today,today,'month');assert.deepEqual(p,{since:'2026-11-01',until:today});assert.deepEqual(previousComparablePeriod(p,'month'),{since:'2026-10-01',until:'2026-10-25'});const v=makeVisual(d,buildReview(d,p));assert.equal(v.trend.length,25);assert.equal(v.lists.find(r=>r.id==='work').actual,30);assert.equal(v.lists.find(r=>r.id==='unknown').actual,10);assert.equal(v.months.length,6);
});
test('旧端围栏冲突隔离、明确修复与不可恢复历史保护',()=>{
 const a={...newTask('系列','inbox',today),repeat:'daily'},p=seriesControl([a],a.id,'pause')[0],broken={...p,repeatCount:8,miss:'skip'};
 assert.equal(seriesDirectory([broken])[0].state,'conflict');assert.equal(completeTask([broken],a.id,today).length,1);
 const repaired=recoverSeries([broken],a.id,'repair');assert.equal(repaired[0].repeatCount,1);assert.equal(seriesDirectory(repaired)[0].state,'paused');
 const legacy={...broken,status:'completed',completedAt:today+'T12:00:00'},successor={...a,id:'next',seriesId:a.id,previousId:a.id,occurrenceIndex:2};
 assert.equal(seriesDirectory([legacy,successor])[0].state,'conflict');const pair=[legacy,successor];assert.equal(completeTask(pair,'next',today),pair);assert.equal(reconcile(pair,today),pair);assert.equal(recoverSeries(pair,a.id,'repair'),pair);
 const adopted=recoverSeries(pair,a.id,'acknowledge');assert.equal(adopted[0].seriesHold,null);assert.equal(adopted[1],successor);assert.equal(seriesDirectory(adopted)[0].state,'running');
 const closed=recoverSeries([legacy],a.id,'acknowledge');assert.equal(closed[0].status,'completed');assert.equal(closed[0].seriesHold,null);
});

test('基线暂停保护丢失进入同步冲突；显式恢复或结束兼容',()=>{
 const a={...newTask('系列','inbox',today),repeat:'daily'},p=seriesControl([a],a.id,'pause');
 const base={tasks:p},lost={...p[0]};delete lost.seriesHold;
 assert.equal(unsafeSeriesPull(base,{tasks:[lost]}),true);
 assert.equal(unsafeSeriesPull(base,{tasks:seriesControl(p,a.id,'resume')}),false);
 assert.equal(unsafeSeriesPull(base,{tasks:seriesControl(p,a.id,'end')}),false);
 assert.equal(unsafeSeriesPull(base,{tasks:[]}),true);
});

test('删除定时规则时同步清理已失效回执，避免重新配置后无法读取',async()=>{
 const {readRules,writeRules}=await import('../src/core/workflow-rules.js');
 const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 const receipts=Object.fromEntries(Array.from({length:20},(_,i)=>['old-'+i,today]));
 const next=writeRules(storage,{rules:[rule({id:'new'})],auto:true,lastRun:today,receipts});
 assert.deepEqual(next.receipts,{});assert.deepEqual(readRules(storage).receipts,{});
});
test('回顾仅在对应周期末运行，已删除任务专注归入未知',async()=>{
 const {isSnapshotDay}=await import('../src/core/review-schedule.js');
 assert.equal(isSnapshotDay('2026-11-25','week'),false);assert.equal(isSnapshotDay('2026-11-29','week'),true);
 assert.equal(isSnapshotDay('2028-02-29','month'),true);assert.equal(isSnapshotDay('2028-02-28','month'),false);
 const d=initialState(),t={...newTask('已删除','work',today),deletedAt:today};d.tasks=[t];d.sessions=[{taskId:t.id,mode:'focus',seconds:600,startedAt:today+'T10:00:00'}];
 assert.equal(makeVisual(d,buildReview(d,{since:today,until:today})).lists.find(r=>r.id==='unknown').actual,10);
});
