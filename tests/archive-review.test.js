import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../src/core/domain.js';
import {archivePreference,filterHistory,readSnapshots,saveSnapshot,deleteSnapshot,SNAPSHOT_KEY,SNAPSHOT_LIMIT} from '../src/core/archive-review.js';
import {buildReview} from '../src/core/task-review.js';
import {taskFromCapture} from '../src/core/task-defaults.js';
test('本机归档可恢复并保护收集箱，不更改清单或收藏',()=>{
 const state={archivedLists:[],favoriteLists:['work']};assert.equal(archivePreference(state,'inbox',true),state);
 const next=archivePreference(state,'work',true);assert.deepEqual(next.archivedLists,['work']);assert.deepEqual(next.favoriteLists,['work']);assert.deepEqual(archivePreference(next,'work',false),state);
});
test('完成日期、清单和标签组合筛选，逆序日期无结果',()=>{
 const a={listId:'work',tags:['tag'],completedAt:'2026-11-25T12:00:00'},b={...a,tags:[]},c={...a,completedAt:'2026-11-26T12:00:00'};
 assert.deepEqual(filterHistory([a,b,c],{since:'2026-11-25',until:'2026-11-25',list:'work',tag:'tag'}),[a]);
 assert.deepEqual(filterHistory([a,b,c],{since:'2026-11-26',until:'2026-11-25'}),[]);
});
test('默认提醒只生成未来有效日期，未安排或过期不设置',()=>{
 const list={id:'work',sections:[]},today='2026-11-25',now=new Date(today+'T10:00:00'),defaults={reminderTime:'11:00'};
 const create=(date,pref=defaults)=>taskFromCapture({parsed:{title:'任务',date},list,today,defaults:pref,now});
 assert.equal(create(today).reminderAt,today+'T11:00');
 assert.equal(create(today,{reminderTime:'09:00'}).reminderAt,'');
 assert.equal(create('').reminderAt,'');assert.equal(create(today,{reminderTime:'25:00'}).reminderAt,'');
});
test('快照内容冻结，拒绝覆盖损坏数据，容量上限不自动删除',()=>{
 let raw=null;const storage={getItem:k=>raw,setItem:(k,v)=>{raw=v}};
 const d=initialState(),today='2026-11-25';d.tasks=[newTask('原任务','inbox',today)];
 const r=buildReview(d,{since:today,until:today}),rows=saveSnapshot(storage,r,'day',new Date(today+'T12:00:00'));
 d.tasks[0].title='修改后';assert.match(readSnapshots(storage)[0].markdown,/原任务/);assert.doesNotMatch(readSnapshots(storage)[0].markdown,/修改后/);
 assert.equal(deleteSnapshot(storage,rows[0].id).length,0);
 raw='{broken';assert.throws(()=>saveSnapshot(storage,r,'day'));assert.equal(raw,'{broken');
 raw=JSON.stringify(Array.from({length:SNAPSHOT_LIMIT},(_,i)=>({...rows[0],id:String(i)})));
 const before=raw;assert.throws(()=>saveSnapshot(storage,r,'day'),/30份/);assert.equal(raw,before);
});
