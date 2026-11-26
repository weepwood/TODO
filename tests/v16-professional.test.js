import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState} from '../src/core/domain.js';
import {planBlockSnapshot,changePlanBlock,expandPlanBlocks} from '../src/core/plan-block.js';
import {previewCapture,captureBatch,previewBulkProperties,applyBulkProperties,reorderChecklist,workspaceDiff,readNoteDraft,saveNoteDraft} from '../src/core/professional-workflow.js';
import {parseMarkdownTasks,previewExchange,inferMapping,exportTasks} from '../src/core/task-exchange.js';
import {templateTask} from '../src/core/task-workflow.js';
import {attachNativeLifecycle} from '../src/services/native-store.js';
const date='2026-11-26',tomorrow='2026-11-27',base=tasks=>({...initialState(),tasks}),task=(id,fields={})=>({...newTask(id,'inbox',date,id),...fields});
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)}};
test('补充段移动/拉伸事务保留主段和预计时长，拒绝锁定及过期',()=>{
 const a=task('a',{time:'09:00',duration:60,planMinutes:30,planSegments:[{id:'s',date,time:'10:00',minutes:20}]}),d=base([a]);
 const snap=planBlockSnapshot(a,'s');const next=changePlanBlock(d,snap,{date:tomorrow,time:'11:00',planMinutes:45});
 assert.deepEqual(next.tasks[0].planSegments,[{id:'s',date:tomorrow,time:'11:00',minutes:45}]);assert.equal(next.tasks[0].duration,60);assert.equal(next.tasks[0].planMinutes,30);assert.equal(next.tasks[0].time,'09:00');
 assert.equal(changePlanBlock(next,snap,{planMinutes:50}),next);
 const locked=base([{...a,planLocked:true}]);assert.equal(changePlanBlock(locked,snap,{planMinutes:50}),locked);
 assert.equal(expandPlanBlocks(d.tasks)[1].planLocked,false);assert.equal(expandPlanBlocks(locked.tasks)[1].planLocked,true);
 assert.equal(changePlanBlock(d,snap,{time:''}),d);assert.equal(changePlanBlock(d,snap,{date:'2026-02-30'}),d);
 assert.deepEqual(migrateState(next).tasks[0].planSegments,next.tasks[0].planSegments);
 const main=planBlockSnapshot(a);assert.equal(changePlanBlock(d,main,{time:''}).tasks[0].time,'');assert.equal(changePlanBlock(d,main,{time:'09:00'}),d);
});
test('批量捕获解析、默认属性与上限，批量属性预览提交时拒绝陈旧记录',()=>{
 const d=base([]),rows=previewCapture('阅读 明天 09:00 !2\n整理资料 后天',date);
 const result=captureBatch(d,rows,'inbox',date,{duration:50});assert.equal(result.tasks.length,2);assert.equal(result.tasks[0].date,tomorrow);assert.equal(result.tasks[0].duration,50);assert.equal(result.tasks[0].priority,2);
 assert.equal(captureBatch(d,previewCapture('明天 !2',date),'inbox',date,{}),d);assert.throws(()=>previewCapture(Array(101).fill('a').join('\n'),date));
 const fields={duration:75},ids=result.tasks.map(t=>t.id),preview=previewBulkProperties(result,ids,fields);
 assert.equal(applyBulkProperties(result,preview,fields).tasks[0].duration,75);
 const stale={...result,tasks:[{...result.tasks[0],duration:35},result.tasks[1]]};assert.equal(applyBulkProperties(stale,preview,fields),stale);
 assert.equal(previewBulkProperties(result,ids,{duration:0}).length,0);
});
test('模板参数仅改变新实例，检查项排序保留身份和完成状态',()=>{
 const t=task('a',{time:'10:00',checklist:[{id:'1',text:'甲',done:true},{id:'2',text:'乙',done:false}]}),d=base([t]);
 const next=templateTask({task:t},d,{title:'实例',listId:'inbox',date:tomorrow,time:'13:00',duration:90,priority:3});
 assert.equal(next.duration,90);assert.equal(next.time,'13:00');assert.equal(t.duration,30);assert(!next.checklist[0].done);assert.notEqual(next.checklist[0].id,'1');
 assert.deepEqual(reorderChecklist(t.checklist,'2',-1).map(c=>[c.id,c.done]),[['2',false],['1',true]]);
 assert.equal(templateTask({task:t},d,{title:'bad',listId:'inbox',duration:0}),null);
});
test('Obsidian Tasks 日期解析显式启用，元数据完整往返及普通Markdown不变',()=>{
 const md='- [ ] 阅读 ⏳ 2026-11-26 📅 2026-11-27',d=base([]);
 const p=parseMarkdownTasks(md,{obsidian:true}),r=previewExchange(p,inferMapping(p.header),'inbox',d)[0];assert.equal(r.fields.title,'阅读');assert.equal(r.fields.date,date);assert.equal(r.fields.deadline,tomorrow);
 assert.equal(parseMarkdownTasks(md).rows[0][0],'阅读 ⏳ 2026-11-26 📅 2026-11-27');
 const t=task('标题 📅 2026-11-27',{deadline:date+'T18:00',notes:'备注',time:'09:00'}),p2=parseMarkdownTasks(exportTasks([t],'obsidian'),{obsidian:true}),r2=previewExchange(p2,inferMapping(p2.header),'inbox',d)[0];assert.equal(r2.fields.title,t.title);assert.equal(r2.fields.deadline,t.deadline);assert.equal(r2.fields.notes,'备注');
});
test('备份差异按身份比较，本机草稿不写入任务',()=>{
 const a=task('a'),b=task('b'),c=task('c'),d=base([a,b]),diff=workspaceDiff(d,base([{...a,title:'新'},c]));
 assert.deepEqual(diff[0],{key:'tasks',added:1,removed:1,changed:1,unchanged:0});assert.equal(a.title,'a');
 const s=storage(),other=storage();saveNoteDraft(s,'a','原文','草稿',date+'T00:00:00Z');assert.equal(readNoteDraft(s,'a').text,'草稿');assert.equal(readNoteDraft(other,'a'),null);
 assert.equal(readNoteDraft(s,'b'),null);
});
test('原生后台保存合并同时事件，错误时不循环重试，卸载后停止',async()=>{
 const doc=new EventTarget(),win=new EventTarget();doc.visibilityState='hidden';let calls=0,resolve,status={pending:true,error:''};
 const store={getStatus:()=>status,flush:()=>{calls++;return new Promise(r=>{resolve=r})}};
 const clean=attachNativeLifecycle(store,doc,win);doc.dispatchEvent(new Event('visibilitychange'));win.dispatchEvent(new Event('pagehide'));await Promise.resolve();assert.equal(calls,1);resolve(true);await new Promise(r=>setImmediate(r));
 status={pending:true,error:'failed'};win.dispatchEvent(new Event('pagehide'));await Promise.resolve();assert.equal(calls,1);
 clean();status={pending:true,error:''};win.dispatchEvent(new Event('pagehide'));await Promise.resolve();assert.equal(calls,1);
});
