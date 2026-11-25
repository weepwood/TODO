import test from 'node:test';
import assert from 'node:assert/strict';
import {sortTasks,desktopSelection} from '../src/core/task-list-interaction.js';
test('file-style selection with anchor, range replacement and modifier toggles',()=>{
 const ids=['a','b','c','d','e'],base={ids,checked:[],selected:null,anchor:null};
 const choose=(state,clicked,range=false,toggle=false)=>desktopSelection({...state,ids,clicked,range,toggle});
 let s=choose(base,'b');assert.deepEqual(s.checked,[]);
 s=choose(s,'d',true);assert.deepEqual(s.checked,['b','c','d']);assert.equal(s.anchor,'b');
 s=choose(s,'c',true);assert.deepEqual(s.checked,['b','c']);
 s=choose(s,'e',false,true);assert.deepEqual(s.checked,['b','c','e']);
 s=choose(s,'c',false,true);assert.deepEqual(s.checked,['b','e']);
 s=choose(s,'a');assert.deepEqual(s.checked,[]);assert.equal(s.anchor,'a');
 assert.deepEqual(choose(s,'e',false,true).checked,['a','e']);
});
test('ascending and descending sort without mutating original and undated tasks last',()=>{
 const a=[{id:'b',title:'任务10',date:'',priority:1,createdAt:'2026-01-01'},{id:'a',title:'任务2',date:'2026-02-02',priority:3,createdAt:'2026-02-02'},{id:'c',title:'任务1',date:'2026-01-01',priority:2,createdAt:'2026-03-03'}];
 const ids=(sort,order)=>sortTasks(a,sort,order).map(t=>t.id);
 assert.deepEqual(ids('title','asc'),['c','a','b']);
 assert.deepEqual(ids('title','desc'),['b','a','c']);
 assert.deepEqual(ids('date','desc'),['a','c','b']);
 assert.deepEqual(ids('priority','desc'),['a','c','b']);
 assert.deepEqual(ids('manual','desc'),['b','a','c']);
 assert.deepEqual(a.map(t=>t.id),['b','a','c']);
});
