import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {initialState,newTask} from '../src/core/domain.js';
import {defaultWeek,saveWeek,readWeek,previewWeekReflow,applyWeekReflow,elapsedBudget} from '../src/core/weekly-planner.js';
import {previewSeriesBatch,applySeriesBatch} from '../src/core/series-control.js';
import {saveMode,exportModes,previewModeImport,applyModeImport,readModes} from '../src/core/workspace-modes.js';
import {saveNoteDraft,noteDraftKey} from '../src/core/professional-workflow.js';
import {listDrafts,removeDraft} from '../src/core/draft-directory.js';
import {scopedStorage} from '../src/services/cloud-core.js';
import {backupTaskChanges} from '../src/core/backup-selection.js';
import {parseMarkdownTasks,previewExchange,inferMapping,makeImportTasks,exportTasks} from '../src/core/task-exchange.js';
import {visualSourceAllowed} from '../src/core/markdown-compat.js';
import {resizeTimelineDuration} from '../src/core/timeline-layout.js';
import {attachNativeLifecycle} from '../src/services/native-store.js';
import {calendarBusy} from '../src/core/productivity.js';
import {nextSlot} from '../src/core/advanced.js';
const date='2026-11-27',monday='2026-11-30',task=(id,fields={})=>({...newTask(id,'inbox',date,id),...fields}),base=tasks=>({...initialState(),tasks});
const storage=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
test('工作周跨休息日重排，固定/截止/过期预览保护',()=>{
 const week=defaultWeek(),s=storage();saveWeek(s,week);assert.deepEqual(readWeek(s),week);
 const fixed=task('fixed',{time:'09:00',duration:540,planMinutes:540,planLocked:true}),a=task('a',{time:'10:00',duration:30}),b=task('b',{time:'11:00',duration:30,deadline:date+'T17:00'}),d=base([fixed,a,b]);
 const proposal=previewWeekReflow(d,date,week,7);assert.deepEqual(proposal.map(r=>[r.id,r.date,r.to]),[['a',monday,'09:00']]);
 assert.deepEqual(previewWeekReflow(d,date,week,3),[]);
 const next=applyWeekReflow(d,date,week,7,proposal);assert.equal(next.tasks[1].date,monday);assert.equal(next.tasks[0],fixed);assert.equal(next.tasks[2],b);
 assert.equal(applyWeekReflow(next,date,week,7,proposal),next);
 assert.equal(elapsedBudget([fixed],date,'09:00','18:00').remaining,0);
 assert.equal(resizeTimelineDuration(30,60,1410,1440,true),90);assert.equal(resizeTimelineDuration(30,60,1410,1440,false),30);
});
test('夏令时真实时区子进程：缺失/重复时刻，经过分钟，外部第二个重复小时',()=>{
 const code=`import assert from 'node:assert/strict';
 import {uniqueWallInstant,elapsedWindow,busyRanges} from './src/core/time-intervals.js';
 import {calendarBusy,executionPlan} from './src/core/productivity.js';
 import {nextSlot,taskConflicts} from './src/core/advanced.js';
 import {newTask} from './src/core/domain.js';
 assert.equal(uniqueWallInstant('2026-03-08','02:30'),null);
 assert.equal(uniqueWallInstant('2026-11-01','01:30'),null);
 assert.equal(elapsedWindow([],'2026-03-08','00:00','04:00').capacity,180);
 assert.equal(elapsedWindow([],'2026-11-01','00:00','04:00').capacity,300);
 const events=calendarBusy([{id:'fold',title:'外部',start:'2026-11-01T01:00:00-05:00',end:'2026-11-01T01:30:00-05:00'}]);
 assert.equal(busyRanges(events)[0][0],Date.parse('2026-11-01T06:00:00Z'));
 assert.equal(nextSlot(events,'2026-11-01',30,'01:00','04:00'),null);
 const blocked=calendarBusy([{id:'fixed',title:'固定',start:'2026-11-01T00:00:00-04:00',end:'2026-11-01T01:30:00-04:00'}]);
 assert.equal(nextSlot(blocked,'2026-11-01',30,'00:00','04:00'),'02:00');
 const t=newTask('未安排');t.duration=200;
 assert.equal(executionPlan([t],'2026-03-08',{start:'00:00',end:'04:00',remainingBlocks:true,splitDays:1}).placements.length,0);
 `;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:process.cwd(),env:{...process.env,TZ:'America/New_York'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
test('外部事件秒级结束不会把任务安排到重叠分钟',()=>{
 const ext=calendarBusy([{id:'x',title:'外部',start:date+'T09:00:00',end:date+'T09:30:15'}]);
 assert.equal(nextSlot(ext,date,30,'09:00','11:00'),'09:31');
 assert.equal(nextSlot(ext,date,30,'09:00','10:00'),null);
});
test('批量系列仅暂停和恢复符合条件的实例，过期快照拒绝',()=>{
 const a=task('a',{repeat:'daily',seriesStart:date}),b=task('b',{repeat:'weekly',seriesStart:date}),c=task('c');
 const tasks=[a,b,c],rows=previewSeriesBatch(tasks,['a','b','c'],'pause');assert.equal(rows.length,2);
 const paused=applySeriesBatch(tasks,rows,'pause');assert.equal(paused[0].repeatCount,1);assert.equal(paused[1].seriesHold.count,0);assert.equal(paused[2],c);
 assert.equal(applySeriesBatch(paused,rows,'pause'),paused);
 assert.equal(applySeriesBatch([a,{...b,interval:2},c],rows,'pause')[0],a);
 const resumed=applySeriesBatch(paused,previewSeriesBatch(paused,['a','b'],'resume'),'resume');assert.equal(resumed[0].seriesHold,null);assert.equal(resumed[1].repeatCount,0);
});
test('命名模式布局配置仅白名单导出，同名不覆盖、过期拒绝',()=>{
 const s=storage(),other=storage(),snapshot={module:'tasks',view:'private-list-id',sidebarHidden:false,detailVisible:true,sidebar:228,detail:350,listLayout:{sort:'title',group:'list',order:'asc',completed:'hide',fields:['date']},appearance:{density:'compact',font:'large'},secret:'never-export'};
 const rows=saveMode(s,'布局',snapshot),raw=exportModes(rows);assert(!raw.includes('private-list-id'));assert(!raw.includes('never-export'));assert.equal(JSON.parse(raw).modes[0].view,'today');
 const p=previewModeImport(other,raw);assert.equal(p.added.length,1);applyModeImport(other,p);assert.equal(readModes(other)[0].listLayout.fields[0],'date');
 assert.equal(previewModeImport(other,raw).skipped.length,1);assert.throws(()=>applyModeImport(other,p));
});
test('草稿目录仅列出账户作用域，孤立及损坏记录不覆盖',()=>{
 const raw=storage(),a=scopedStorage(raw,'a'),b=scopedStorage(raw,'b'),now=date+'T00:00:00Z';
 saveNoteDraft(a,'one','原文','草稿',now);saveNoteDraft(a,'orphan','','孤立',now);saveNoteDraft(b,'secret','','私密',now);a.setItem(noteDraftKey('bad'),'{broken');
 const rows=listDrafts(a,[task('one',{notes:'原文'})]);assert.equal(rows.length,3);assert.equal(rows.find(r=>r.id==='one').status,'current');assert.equal(rows.find(r=>r.id==='orphan').status,'orphaned');assert.equal(rows.find(r=>r.id==='bad').status,'invalid');assert(!rows.some(r=>r.id==='secret'));
 const row=rows.find(r=>r.id==='one');saveNoteDraft(a,'one','原文','更新',now);assert.throws(()=>removeDraft(a,row));assert.equal(listDrafts(a,[task('one')]).find(r=>r.id==='one').status,'stale');assert.throws(()=>removeDraft(a,rows.find(r=>r.id==='bad')));
});
test('跨清单层级导出及唯一名称匹配，保持父子关联，正确忽略混合围栏',()=>{
 const d=base([task('parent',{listId:'work'}),task('child',{listId:'personal',parentId:'parent'})]),raw=exportTasks(d.tasks,'markdown-workspace',d.lists),p=parseMarkdownTasks(raw,{tree:true,workspace:true}),rows=previewExchange(p,inferMapping(p.header),'inbox',base([]));
 const tasks=makeImportTasks(rows);assert.equal(tasks[0].listId,'work');assert.equal(tasks[1].listId,'personal');assert.equal(tasks[1].parentId,tasks[0].id);
 const invalid=base([]);invalid.lists=invalid.lists.filter(l=>l.id!=='work');assert(previewExchange(p,inferMapping(p.header),'inbox',invalid).every(r=>r.error));
 const fenced=['````md','- [ ] 非任务','~~~','- [ ] 仍是代码','```','- [ ] 仍是代码','````','- [ ] 真任务'].join('\n');assert.equal(parseMarkdownTasks(fenced,{tree:true}).rows.length,1);
});
test('备份差异逐记录只读；复杂代码围栏源文安全闸',()=>{
 const a=task('a'),b=task('b'),d=base([a,b]),n=base([{...a,notes:'变化'},task('c')]);const changes=backupTaskChanges(d,n);assert.deepEqual(changes.map(r=>[r.id,r.kind]),[['a','changed'],['c','added'],['b','removed']]);assert.deepEqual(changes[0].fields,['notes']);assert.equal(a.notes,'');
 assert(visualSourceAllowed('```html\n<div>代码</div>\n```'));
 assert(!visualSourceAllowed('<img src="https://example.com/">'));assert(!visualSourceAllowed('```bad`\n<img src="https://example.com/">\n```'));assert(!visualSourceAllowed('```html\n<div>未关闭'));
});
test('原生失焦、暂停与页面离开合并触发，失败不重复自动重试',async()=>{
 const doc=new EventTarget(),win=new EventTarget();doc.visibilityState='hidden';let calls=0,resolve,status={pending:true,error:''};const store={getStatus:()=>status,flush:()=>{calls++;return new Promise(r=>resolve=r)}};
 const clean=attachNativeLifecycle(store,doc,win);win.dispatchEvent(new Event('todo-native-pause'));win.dispatchEvent(new Event('blur'));doc.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();assert.equal(calls,1);
 status={pending:true,error:'failed'};resolve(false);await new Promise(r=>setImmediate(r));win.dispatchEvent(new Event('todo-native-pause'));await Promise.resolve();assert.equal(calls,1);clean();
});
