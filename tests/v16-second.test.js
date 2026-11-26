import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../src/core/domain.js';
import {projectedCapacity,previewReflow,applyReflow,readWorkHours,saveWorkHours} from '../src/core/planner-interaction.js';
import {prepareCapture,appendCapture,previewCapture,previewBulkProperties,applyBulkProperties} from '../src/core/professional-workflow.js';
import {templateTask} from '../src/core/task-workflow.js';
import {parseMarkdownTasks,previewExchange,inferMapping,makeImportTasks,exportTasks,appendImportedTasks,canUndoImport,prepareImportReceipt,verifyImportUndo} from '../src/core/task-exchange.js';
import {saveMode,readModes,deleteMode} from '../src/core/workspace-modes.js';
import {obsidianURI,readAssociation,saveAssociation,historicalSearch} from '../src/core/local-knowledge.js';
const date='2026-11-26',tomorrow='2026-11-27',task=(id,fields={})=>({...newTask(id,'inbox',date,id),...fields}),base=tasks=>({...initialState(),tasks});
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
test('跨午夜的完整冲突与目标日容量，排除正在移动的原块',()=>{
 const a=task('a',{time:'09:00',duration:60}),b=task('b',{date:tomorrow,time:'00:15',duration:30});
 const p=projectedCapacity([a,b],'a',date,'23:30',60,'00:00','23:59');
 assert.deepEqual(p.overlaps,['b']);assert.deepEqual(p.days.map(d=>d.date),[date,tomorrow]);assert.equal(p.days[1].occupied,45);
 assert.deepEqual(projectedCapacity([a,b],'a',date,'23:15',60,'00:00','23:59').overlaps,[]);
});
test('智能重排保护锁定、关联、多段和截止限制，并拒绝过期预览',()=>{
 const locked=task('fixed',{time:'09:00',duration:60,planLocked:true,planMinutes:60}),a=task('a',{time:'09:15',duration:30}),b=task('b',{time:'09:30',duration:30,deadline:date+'T09:45'}),d=base([locked,a,b]);
 const rows=previewReflow(d,date,'09:00','12:00');assert.deepEqual(rows.map(r=>r.id),['a']);assert.equal(rows[0].to,'10:00');
 const next=applyReflow(d,date,'09:00','12:00',rows);assert.equal(next.tasks[1].time,'10:00');assert.equal(next.tasks[0],locked);assert.equal(next.tasks[2],b);
 assert.equal(applyReflow(next,date,'09:00','12:00',rows),next);
});
test('工作时段与命名布局存储校验、重复名称不覆盖',()=>{
 const s=storage();saveWorkHours(s,'早班','08:00','16:00');assert.throws(()=>saveWorkHours(s,'早班','09:00','17:00'));assert.equal(readWorkHours(s)[0].start,'08:00');
 const snapshot={module:'planner',view:'today',sidebarHidden:true,detailVisible:false,sidebar:228,detail:350};saveMode(s,'规划',snapshot);assert.equal(readModes(s)[0].module,'planner');assert.throws(()=>saveMode(s,'规划',snapshot));assert.deepEqual(deleteMode(s,'规划'),[]);
});
test('批量创建唯一ID结果，跨清单分组完整快照及模板变量',()=>{
 const d=base([task('a')]);const list=d.lists.find(l=>l.id==='work');list.sections=[{id:'s',name:'分组'}];const rows=previewCapture('任务 明天',date),prepared=prepareCapture(d,rows,'inbox',date,{}),next=appendCapture(d,prepared);
 assert.equal(next.tasks[1].id,prepared[0].id);assert.equal(appendCapture(next,prepared),next);
 const fields={listId:'work',sectionId:'s'},review=previewBulkProperties(d,['a'],fields),moved=applyBulkProperties(d,review,fields);
 assert.equal(moved.tasks[0].sectionId,'s');assert.equal(moved.tasks[0].listId,'work');assert.equal(applyBulkProperties(moved,review,fields),moved);
 const template={task:task('t',{title:'{{项目}} {{日期}}',notes:'{{清单}}',checklist:[{id:'x',text:'{{项目}}',done:true}]})};
 const instance=templateTask(template,d,{title:template.task.title,listId:'work',date,project:'研究'});assert.equal(instance.title,'研究 '+date);assert.equal(instance.notes,list.name);assert.equal(instance.checklist[0].text,'研究');assert.equal(template.task.checklist[0].text,'{{项目}}');
 assert.equal(templateTask(template,d,{title:template.task.title,listId:'work',date}),null);
});
test('层级Markdown保留安全链接及父子关系，禁止孤立导入；整批未修改可撤销',async()=>{
 const parent=task('p',{links:[{name:'资料',url:'https://example.com/'}]}),child=task('c',{parentId:'p'}),raw=exportTasks([child,parent],'markdown-tree'),p=parseMarkdownTasks(raw,{tree:true});
 const rows=previewExchange(p,inferMapping(p.header),'inbox',base([]));assert.equal(rows[1].parentIndex,1);assert.deepEqual(rows[0].fields.links,parent.links);assert.throws(()=>makeImportTasks([rows[1]]));
 const tasks=makeImportTasks(rows);assert.equal(tasks[1].parentId,tasks[0].id);const receipt=await prepareImportReceipt(tasks,{id:'tree',at:date+'T00:00:00Z'}),d=appendImportedTasks(base([]),tasks,receipt),proof=await verifyImportUndo(d,'tree');assert.equal(canUndoImport(d,'tree',proof),true);
 const external={...d,tasks:[...d.tasks,task('ext',{dependsOn:[tasks[0].id]})]};assert.equal(canUndoImport(external,'tree',proof),false);
 assert.equal(parseMarkdownTasks('- [x] 完成\n  - [ ] 子任务\n- [ ] 新',{tree:true}).rows.length,1);
});
test('Obsidian URI限定库名和相对路径，历史只读筛选',()=>{
 const s=storage();assert.equal(obsidianURI('个人库','../私密.md'),null);assert.equal(obsidianURI('个人库','/private.md'),null);assert.equal(obsidianURI('个人库',' /private.md'),null);saveAssociation(s,'a','个人库','项目/记录.md');assert.equal(readAssociation(s,'a').file,'项目/记录.md');assert.match(obsidianURI('个人库','项目/记录.md'),/^obsidian:\/\/open\?vault=/);
 const a=task('a',{status:'completed',completedAt:date+'T00:00:00Z',notes:'研究'}),b=task('b'),c=task('c',{deletedAt:date+'T00:00:00Z'});assert.deepEqual(historicalSearch(base([a,b,c]),[],'研究','all').map(t=>t.id),['a']);
});
