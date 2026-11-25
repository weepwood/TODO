import {readViewPreferences,VIEW_PREFS_KEY} from './view-preferences.js';
import {canonical} from '../services/cloud-core.js';
export const PREFERENCE_BACKUP_KEY='todo-view-preferences-sync-backup-v1';
// Only portable semantic preferences; device layout, scroll, shortcuts, automation
// schedules and archive navigation remain local. Explicit publish/apply, never LWW.
export function portablePreferences(state){
 return {views:Object.fromEntries(Object.entries(state.views).filter(([k])=>k!=='search').map(([k,v])=>[k,{sort:v.sort,group:v.group,order:v.order,completed:v.completed}])),favoriteLists:state.favoriteLists,pinnedTasks:state.pinnedTasks,taskDefaults:state.taskDefaults,showCompleted:state.showCompleted};
}
export function validPreferenceProfile(profile){
 try{
  if(!profile||profile.version!==1||!Number.isFinite(Date.parse(profile.savedAt))||!profile.value||typeof profile.value!=='object')return false;
  const raw=JSON.stringify(profile.value);if(new TextEncoder().encode(raw).length>256*1024)return false;
  const normalized=portablePreferences(readViewPreferences({getItem:()=>raw}));
  return canonical(normalized)===canonical(profile.value);
 }catch{return false}
}
export function makePreferenceProfile(state,now=new Date()){
 return {version:1,savedAt:now.toISOString(),value:portablePreferences(state)};
}
export function mergePortablePreferences(local,profile){
 if(!validPreferenceProfile(profile))throw Error('云端偏好格式不兼容，未修改本机设置');
 const p=profile.value,views=Object.create(null);
 for(const key of new Set([...Object.keys(local.views),...Object.keys(p.views)])){
  if(key==='search'){if(local.views[key])views[key]=local.views[key];continue}
  const source=Object.hasOwn(p.views,key)?p.views[key]:null;if(!source&&!local.views[key]?.collapsedGroups?.length)continue;
  views[key]={...(source||{sort:'manual',group:'section',order:'asc',completed:'inherit'}),collapsedGroups:local.views[key]?.collapsedGroups||[]};
 }
 if(Object.keys(views).length>300)throw Error('合并后的视图数量超过上限，未修改本机偏好');
 return {...local,...p,views};
}
export function replaceLocalPreferences(storage,next){
 const previous=storage.getItem(VIEW_PREFS_KEY);
 // If backup cannot be written, do not touch the original.
 storage.setItem(PREFERENCE_BACKUP_KEY,JSON.stringify({savedAt:new Date().toISOString(),raw:previous}));
 storage.setItem(VIEW_PREFS_KEY,JSON.stringify(next));
 return next;
}
export function restoreLocalPreferences(storage){
 const backup=JSON.parse(storage.getItem(PREFERENCE_BACKUP_KEY)||'null');
 if(!backup||!(backup.raw===null||typeof backup.raw==='string'))throw Error('没有可恢复的偏好备份');
 if(backup.raw!==null){const parsed=JSON.parse(backup.raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('偏好备份无效');}
 const next=readViewPreferences({getItem:()=>backup.raw});
 storage.setItem(VIEW_PREFS_KEY,JSON.stringify(next));return next;
}
