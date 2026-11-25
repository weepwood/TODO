import test from 'node:test';
import assert from 'node:assert/strict';
import {readViewPreferences,updateViewPreference,normalizeView,defaultView,VIEW_PREFS_KEY,toggleGroupPreference,groupPreferenceKey,showCompletedInView} from '../src/core/view-preferences.js';
test('validates preference values and isolated view patches',()=>{
 const state=readViewPreferences({getItem:()=>null});
 const first=updateViewPreference(state,'inbox',{sort:'title',order:'desc'});
 const second=updateViewPreference(first,'work',{group:'date'});
 assert.deepEqual(second.views.inbox,{...defaultView(),sort:'title',order:'desc'});
 assert.deepEqual(second.views.work,{...defaultView(),group:'date'});
 assert.deepEqual(first.views.work,undefined);
 assert.deepEqual(normalizeView({sort:'bad',group:'bad',order:'bad'}),defaultView());
 assert.deepEqual(readViewPreferences({getItem:key=>key===VIEW_PREFS_KEY?JSON.stringify(second):null}),second);
});
test('invalid storage falls back and bounded keys cannot alter prototype',()=>{
 assert.deepEqual(readViewPreferences({getItem:()=>'{'}).views,{});
 const v=updateViewPreference({views:{}},'__proto__',{sort:'title'});
 assert.equal(v.views.__proto__.sort,'title');
 assert.equal({}.sort,undefined);
 let state={views:{}};
 for(let i=0;i<305;i++)state=updateViewPreference(state,'view-'+i,{group:'list'});
 assert.equal(Object.keys(state.views).length,300);
});

test('fold state is independent by view and grouping dimension',()=>{
 let s=readViewPreferences({getItem:()=>null});
 s=toggleGroupPreference(s,'inbox','section','unassigned',true);
 s=toggleGroupPreference(s,'inbox','date','unassigned',true);
 s=toggleGroupPreference(s,'today','section','unassigned',true);
 s=toggleGroupPreference(s,'inbox','section','unassigned',false);
 assert.deepEqual(s.views.inbox.collapsedGroups,[groupPreferenceKey('date','unassigned')]);
 assert.deepEqual(s.views.today.collapsedGroups,[groupPreferenceKey('section','unassigned')]);
 assert.deepEqual(normalizeView({collapsedGroups:[42,'a','a',null]}).collapsedGroups,['a']);
});

test('completed visibility defaults to hidden and independent lists can override global settings',()=>{
 const original=readViewPreferences({getItem:()=>null});
 assert.equal(showCompletedInView(original,'inbox'),false);
 let state={...original,showCompleted:true};
 assert.equal(showCompletedInView(state,'inbox'),true);
 state=updateViewPreference(state,'inbox',{completed:'hide'});
 assert.equal(showCompletedInView(state,'inbox'),false);
 assert.equal(showCompletedInView(state,'work'),true);
 state=updateViewPreference(state,'inbox',{completed:'inherit'});
 assert.equal(showCompletedInView(state,'inbox'),true);
 assert.equal(normalizeView({completed:'invalid'}).completed,'inherit');
 assert.deepEqual(readViewPreferences({getItem:()=>JSON.stringify(state)}),state);
});

test('详情栏偏好按模块存储，兼容旧版并可恢复自动模式',async()=>{
 const {updateDetailPreference,normalizeDetailPreferences}=await import('../src/core/view-preferences.js');
 let state=readViewPreferences({getItem:()=>null});
 assert.deepEqual(state.detailPreferences,{});
 state=updateDetailPreference(state,'tasks',false);
 state=updateDetailPreference(state,'calendar',true);
 assert.deepEqual(readViewPreferences({getItem:()=>JSON.stringify(state)}).detailPreferences,{tasks:false,calendar:true});
 assert.deepEqual(updateDetailPreference(state,'tasks',undefined).detailPreferences,{calendar:true});
 assert.deepEqual(normalizeDetailPreferences({tasks:'false',calendar:true,unknown:true}),{calendar:true});
 assert.equal(updateDetailPreference(state,'unknown',true),state);
});
