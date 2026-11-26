import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState} from '../src/core/domain.js';
import {blockMinutes,blockPatch} from '../src/core/plan-block.js';
import {executionPlan,daySegments,workBudget} from '../src/core/productivity.js';
import {previewPostpone} from '../src/core/task-defaults.js';
import {todayExecution} from '../src/core/today-execution.js';
import {makeQueueRun,carryQueue,queueRunProgress} from '../src/core/focus-queue.js';
import {startQueueRun,settleFocus,changeFocusTimer,focusTimerKey} from '../src/core/focus-engine.js';
import {habitWeek,habitPlanned} from '../src/core/habit-plan.js';
import {periodComparison} from '../src/core/period-goals.js';
import {saveLayoutPreset,normalizeLayoutPresets} from '../src/core/view-preferences.js';
import {previewRules,ruleConflicts,newRule} from '../src/core/workflow-rules.js';
import {parseMarkdownTasks,parseCSV,inferMapping,exportTasks,previewExchange,makeImportTasks,appendImportedTasks,canUndoImport,undoImport} from '../src/core/task-exchange.js';
import {historyReducer} from '../src/history.js';
import {unsafeHistoryPull} from '../src/services/sync-merge.js';
const date='2026-11-26',at=Date.parse(date+'T09:00:00'),iso=new Date(at).toISOString(),task=(id,fields={})=>({...newTask(id,'inbox',date,id),...fields}),base=(tasks=[])=>({...initialState(),tasks});
test('独立占位、剩余预算、锁定与旧数据兼容',()=>{
 const fixed=task('fixed',{time:'09:00',duration:90,planMinutes:30,planLocked:true}),a=task('a',{duration:60}),locked=task('locked',{planLocked:true});
 const data=base([fixed,a,locked]),plan=executionPlan(data.tasks,date,{remainingBlocks:true,sessions:[{taskId:'a',mode:'focus',seconds:1200}],start:'09:00',end:'10:10'});
 assert.equal(plan.placements[0].planMinutes,40);assert.equal(plan.placements[0].time,'09:30');assert.equal(plan.budget.remaining,0);assert.equal(a.duration,60);
 assert.equal(blockMinutes(fixed),30);assert.equal(blockPatch(fixed,{date:'2026-11-27'}),null);assert.equal(blockPatch(a,{planLocked:true}).planMinutes,60);
 assert.equal(previewPostpone([fixed],['fixed'],1).rows.length,0);assert.equal(daySegments([fixed],date)[0].segmentMinutes,30);
 assert.throws(()=>migrateState(base([task('invalid',{planMinutes:0})])));assert.equal(unsafeHistoryPull(data,base([task('fixed'),a,locked])),true);
});
test('今日执行包括无计划但今日截止、积压与依赖，且不改任务',()=>{
 const a=task('a',{date:'',deadline:date+'T08:00'}),b=task('b',{date:'2026-11-25',priority:3}),c=task('c',{dependsOn:['a']}),data=base([b,c,a]);
 const result=todayExecution(data,date,new Date(at));assert.equal(result.next.task.id,'a');assert.equal(result.risk,1);assert.equal(result.backlog,1);assert.equal(result.items.at(-1).blocked,true);assert.equal(a.date,'');
});
test('连续会话独立目标、跨任务自然推进、显式终止、延迟唤醒与跨日恢复',()=>{
 const a=task('a',{duration:2}),b=task('b',{duration:3}),data=base([a,b]),q={date,items:[{id:'a',skipped:false},{id:'b',skipped:false}]};
 const run=makeQueueRun(q,data,240,'run'),s=startQueueRun(data,run,at);assert.equal(s.timer.target,120);
 const rest=settleFocus(s,at+120000);assert.equal(rest.timer.mode,'break');assert.equal(rest.timer.taskId,'b');assert.equal(rest.sessions.length,1);
 assert.deepEqual(migrateState(rest).timer.queueRun,s.timer.queueRun);
 const next=settleFocus(rest,rest.timer.startedAt+rest.timer.target*1000);assert.equal(next.timer.mode,'focus');assert.equal(next.timer.target,120);
 const done=settleFocus(next,next.timer.startedAt+120000);assert.equal(done.timer,null);assert.equal(queueRunProgress(s.timer.queueRun,done).actual,240);assert.equal(done.tasks[0].status,'pending');
 assert.equal(changeFocusTimer(s,{action:'discard',key:focusTimerKey(s.timer),now:at+120000}).timer,null);
 assert.equal(settleFocus(s,at+181000).timer,null);assert.deepEqual(carryQueue(q,done,'2026-11-27').items.map(i=>i.id),['b']);
});
test('周期习惯与历史实际成果使用现存记录、不修改历史',()=>{
 const h={id:'h',name:'阅读',days:['2026-11-23','2026-11-25'],planWeekdays:[1,3,5]};assert(habitPlanned(h,'2026-11-25'));assert(!habitPlanned(h,date));assert.deepEqual(habitWeek(h,date),{start:'2026-11-23',planned:['2026-11-23','2026-11-25','2026-11-27'],completed:2,elapsed:2});
 const d=base([task('done',{status:'completed',stage:'done',completedAt:'2026-10-31T12:00:00'})]),rows={'2026-10':{completed:3,focusMinutes:20},'2026-11':{completed:2,focusMinutes:30}};
 const r=periodComparison(d,rows,'2026-11',date);assert.equal(r[0].end,'2026-10-31');assert.equal(r[0].actual.completed,1);assert.equal(r[1].actual.completed,0);
 assert.throws(()=>migrateState({...d,habits:[{...h,planWeekdays:[]}]}));
});
test('布局预设归一、容量条件及同字段冲突优先',()=>{
 const saved=saveLayoutPreset({},'专注',{sort:'manual',group:'section',fields:['duration'],collapsedGroups:['a']});assert.deepEqual(saved.layoutPresets[0].view.fields,['duration']);assert.deepEqual(saved.layoutPresets[0].view.collapsedGroups,[]);assert.equal(normalizeLayoutPresets([...saved.layoutPresets,...saved.layoutPresets]).length,1);
 const d=base([task('a'),task('fixed',{time:'09:00',planMinutes:540})]),a={...newRule(),name:'优先',condition:'capacity-tight',action:'high'},b={...newRule(),name:'冲突',condition:'capacity-tight',action:'low'};
 assert.equal(previewRules(d,[a,b],date)[0].patch.priority,3);assert.match(ruleConflicts(d,[a,b],date)[0].reason,/优先/);
});
test('Markdown属性往返、负积分CSV、持久撤销及修改后拒绝',()=>{
 const original=task('中文 [测试]',{duration:50,planMinutes:20,points:-3,notes:'中文\n"第二行"',deadline:date+'T18:00'});
 const d=base(),md=parseMarkdownTasks(exportTasks([original],'markdown')),row=previewExchange(md,inferMapping(md.header),'inbox',d)[0];assert.equal(row.fields.notes,original.notes);assert.equal(row.fields.points,-3);assert.equal(row.fields.planMinutes,20);assert.equal(row.fields.title,original.title);
 const csv=parseCSV(exportTasks([original],'csv'));assert.equal(previewExchange(csv,inferMapping(csv.header),'inbox',d)[0].fields.points,-3);
 const tasks=makeImportTasks([row]),receipt={id:'r',at:iso};
 const history=historyReducer({data:d,past:[],future:[]},{type:'edit',value:s=>appendImportedTasks(s,tasks,receipt),meta:{id:'op',at:iso,source:'bulk',session:'s'}});
 const persisted=migrateState(JSON.parse(JSON.stringify(history.data)));assert(canUndoImport(persisted,'r'));assert.equal(undoImport(persisted,'r',iso).tasks[0].deletedAt,iso);
 assert(!canUndoImport({...persisted,tasks:[{...persisted.tasks[0],title:'改过'}]},'r'));
 assert(!canUndoImport({...persisted,sessions:[{taskId:tasks[0].id}]},'r'));
 assert.equal(undoImport(persisted,'r',iso).importRuns[0].undone,true);
});
