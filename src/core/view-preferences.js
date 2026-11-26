import {normalizeTaskDefaults} from './task-defaults.js';
import {SORTS,GROUPS,ORDERS,defaultOrder} from './task-list-interaction.js';
const DETAIL_MODULES=['tasks','calendar','board','matrix','planner','focus','habits','stats','workflow','goals','report'];
export function normalizeDetailPreferences(value){return Object.fromEntries(DETAIL_MODULES.filter(k=>Object.hasOwn(value||{},k)&&typeof value[k]==='boolean').map(k=>[k,value[k]]))}
export function updateDetailPreference(state,module,value){if(!DETAIL_MODULES.includes(module))return state;const next=normalizeDetailPreferences(state.detailPreferences);if(typeof value==='boolean')next[module]=value;else delete next[module];return {...state,detailPreferences:next}}
export const VIEW_PREFS_KEY='todo-view-preferences-v1';
export const VIEW_FIELDS=['points','tags','list','date','deadline','duration'];
export const DEFAULT_VIEW_FIELDS=VIEW_FIELDS.filter(k=>k!=='duration');
export const normalizeViewFields=value=>Array.isArray(value)?VIEW_FIELDS.filter(k=>value.includes(k)):DEFAULT_VIEW_FIELDS;
export const defaultView=()=>({sort:'manual',group:'section',order:'asc',collapsedGroups:[],completed:'inherit'});
const allowed=(options,value)=>options.some(([key])=>key===value);
const strings=value=>Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string'&&v.length<=512))].slice(-300):[];
export const groupPreferenceKey=(mode,id)=>JSON.stringify([mode,id]);
export function normalizeView(value){const sort=allowed(SORTS,value?.sort)?value.sort:'manual';return {sort,group:allowed(GROUPS,value?.group)?value.group:'section',order:allowed(ORDERS,value?.order)?value.order:defaultOrder(sort),collapsedGroups:strings(value?.collapsedGroups),...(Array.isArray(value?.fields)?{fields:normalizeViewFields(value.fields)}:{}),completed:['show','hide'].includes(value?.completed)?value.completed:'inherit'}}
export function readViewPreferences(storage){
 try{const value=JSON.parse(storage.getItem(VIEW_PREFS_KEY)||'{}');const views=Object.fromEntries(Object.entries(value?.views||{}).filter(([k])=>k.length<=256).slice(-300).map(([k,v])=>[k,normalizeView(v)]));
 return {views,...(Array.isArray(value.layoutPresets)?{layoutPresets:normalizeLayoutPresets(value.layoutPresets)}:{}),archivedLists:strings(value.archivedLists).filter(id=>id!=='inbox'),favoriteLists:strings(value.favoriteLists),taskDefaults:Object.fromEntries(Object.entries(value.taskDefaults||{}).filter(([k])=>k.length<=256).slice(-300).map(([k,v])=>[k,normalizeTaskDefaults(v)])),detailPreferences:normalizeDetailPreferences(value.detailPreferences),pinnedTasks:strings(value.pinnedTasks),showCompleted:value.showCompleted===true,sidebarHidden:value.sidebarHidden===true,collapsed:strings(value.collapsed)};
 }catch{return {views:{},archivedLists:[],favoriteLists:[],taskDefaults:{},detailPreferences:{},pinnedTasks:[],showCompleted:false,sidebarHidden:false,collapsed:[]}}
}
export function updateViewPreference(state,key,patch){return {...state,views:Object.fromEntries([...Object.entries(state.views).filter(([k])=>k!==key),[key,normalizeView({...Object.hasOwn(state.views,key)?state.views[key]:defaultView(),...patch})]].slice(-300))}}
export function toggleGroupPreference(state,key,mode,id,collapsed){
 const view=Object.hasOwn(state.views,key)?state.views[key]:defaultView(),groupKey=groupPreferenceKey(mode,id),next=new Set(view.collapsedGroups);
 if(collapsed)next.add(groupKey);else next.delete(groupKey);
 return updateViewPreference(state,key,{collapsedGroups:[...next]});
}

export function showCompletedInView(state,key){const mode=Object.hasOwn(state.views,key)?state.views[key].completed:'inherit';return mode==='show'||(mode!=='hide'&&state.showCompleted===true)}

export function normalizeLayoutPresets(value){
 if(!Array.isArray(value))return [];
 const names=new Set();
 return value.filter(p=>typeof p?.name==='string'&&p.name.trim()&&p.name.length<=60&&!names.has(p.name)&&names.add(p.name)).slice(0,30).map(p=>({name:p.name,view:{...normalizeView(p.view),collapsedGroups:[],fields:normalizeViewFields(p.view?.fields)}}));
}
export function saveLayoutPreset(state,name,view){
 name=String(name||'').trim();if(!name||name.length>60)return state;
 const old=state.layoutPresets||[],next=normalizeLayoutPresets([...old.filter(p=>p.name!==name),{name,view}]);
 if(!next.some(p=>p.name===name))return state;
 return {...state,layoutPresets:next};
}
