import test from 'node:test';
import assert from 'node:assert/strict';
import {readViewPreferences,updateViewPreference,normalizeView,defaultView,VIEW_PREFS_KEY} from '../src/core/view-preferences.js';
test('validates preference values and isolated view patches',()=>{
 const state=readViewPreferences({getItem:()=>null});
 const first=updateViewPreference(state,'inbox',{sort:'title',order:'desc'});
 const second=updateViewPreference(first,'work',{group:'date'});
 assert.deepEqual(second.views.inbox,{sort:'title',order:'desc',group:'section'});
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
