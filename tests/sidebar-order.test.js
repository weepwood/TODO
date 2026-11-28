import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSidebarOrder,orderSidebarItems,moveSidebarItem} from '../src/core/sidebar-order.js';
import {readViewPreferences} from '../src/core/view-preferences.js';
import {makePreferenceProfile,mergePortablePreferences} from '../src/core/preference-sync.js';
test('侧栏顺序去重、删除失效项、新增追加且不改变业务对象',()=>{
 const items=[{id:'a'},{id:'b'},{id:'c'}];
 assert.deepEqual(orderSidebarItems(items,['b','missing','b','a']),[items[1],items[0],items[2]]);
 assert.deepEqual(moveSidebarItem(['a','b','c'],'a','c'),['b','c','a']);
 assert.deepEqual(moveSidebarItem(['a','b'],'a','other'),['a','b']);
 assert.deepEqual(normalizeSidebarOrder({lists:['b',null,'b','a'],bad:'no'}),{lists:['b','a']});
});
test('侧栏排序本机独立，云偏好发布应用不覆盖',()=>{
 const local=readViewPreferences({getItem:()=>JSON.stringify({sidebarOrder:{lists:['b','a']},collapsed:['sidebar-section:lists']})});
 assert.deepEqual(local.sidebarOrder,{lists:['b','a']});
 const profile=makePreferenceProfile(local);
 assert.equal(profile.value.sidebarOrder,undefined);assert.equal(profile.value.collapsed,undefined);
 assert.deepEqual(mergePortablePreferences(local,profile).sidebarOrder,local.sidebarOrder);
});
