import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,migrateState,dayKey} from '../src/core/domain.js';
import {readViewPreferences,VIEW_PREFS_KEY,updateViewPreference} from '../src/core/view-preferences.js';
import {makePreferenceProfile,validPreferenceProfile,mergePortablePreferences,replaceLocalPreferences,restoreLocalPreferences,PREFERENCE_BACKUP_KEY} from '../src/core/preference-sync.js';
import {buildTaskDelta} from '../src/services/task-delta.js';
import {mergeTasks} from '../src/services/sync-merge.js';
import {focusHeatmapCounts,heatmapCells} from '../src/core/workspace-visual.js';
const mock=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}};
test('共享偏好只包含可移植属性，本机布局和折叠保留，备份可恢复',()=>{
 const storage=mock(),local={...readViewPreferences(storage),sidebarHidden:true,collapsed:['folder'],archivedLists:['work'],detailPreferences:{tasks:false},views:{work:{sort:'manual',group:'section',order:'asc',completed:'inherit',collapsedGroups:['local']}}};
 const shared={...readViewPreferences(mock()),favoriteLists:['work'],showCompleted:true,views:{work:{sort:'date',group:'section',order:'asc',completed:'show',collapsedGroups:['remote']}}};
 const profile=makePreferenceProfile(shared,new Date('2026-11-26T12:00:00Z'));assert(validPreferenceProfile(profile));
 assert.equal(profile.value.sidebarHidden,undefined);assert.equal(profile.value.views.work.collapsedGroups,undefined);
 const merged=mergePortablePreferences(local,profile);assert.equal(merged.sidebarHidden,true);assert.deepEqual(merged.archivedLists,['work']);assert.deepEqual(merged.views.work.collapsedGroups,['local']);assert.equal(merged.views.work.completed,'show');assert.deepEqual(merged.favoriteLists,['work']);
 storage.setItem(VIEW_PREFS_KEY,JSON.stringify(local));replaceLocalPreferences(storage,merged);assert.equal(readViewPreferences(storage).showCompleted,true);assert.deepEqual(restoreLocalPreferences(storage),local);
 const base=initialState(),next={...base,preferenceProfile:profile};assert.deepEqual(migrateState(next).preferenceProfile,profile);assert.equal(buildTaskDelta(base,next),null);assert.equal(mergeTasks(base,next,base),null);
});
test('拒绝无效偏好、备份损坏和备份写入失败，不覆盖本机',()=>{
 const storage=mock(),profile=makePreferenceProfile(readViewPreferences(storage));assert(!validPreferenceProfile({...profile,value:{...profile.value,showCompleted:'true'}}));assert.throws(()=>migrateState({...initialState(),preferenceProfile:{...profile,version:2}}));
 storage.setItem(VIEW_PREFS_KEY,'{"showCompleted":true}');storage.setItem(PREFERENCE_BACKUP_KEY,'{"raw":"bad"}');assert.throws(()=>restoreLocalPreferences(storage));assert.equal(storage.getItem(VIEW_PREFS_KEY),'{"showCompleted":true}');
 assert.throws(()=>replaceLocalPreferences({getItem:storage.getItem,setItem:()=>{throw Error('quota')}},{}));assert.equal(storage.getItem(VIEW_PREFS_KEY),'{"showCompleted":true}');
});
test('专注热力图汇总秒数再取整，排除休息及错误日期，支持清单范围',()=>{
 const date='2026-11-26',sessions=[{taskId:'t',mode:'focus',seconds:29,startedAt:date+'T09:00:00'},{taskId:'t',mode:'focus',seconds:29,startedAt:date+'T10:00:00'},{taskId:'t',mode:'break',seconds:300,startedAt:date+'T11:00:00'},{taskId:'u',mode:'focus',seconds:1800,startedAt:date+'T12:00:00'}];
 const map=new Map([['t','work'],['u','personal']]);assert.equal(focusHeatmapCounts(sessions,dayKey,map,'work')[date],1);assert.equal(focusHeatmapCounts(sessions,dayKey,map)[date],31);assert.equal(heatmapCells(date,{[date]:31},7,n=>n>=30?2:0).at(-1).level,2);
});
