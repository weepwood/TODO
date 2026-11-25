import {SORTS,GROUPS,ORDERS,defaultOrder} from './task-list-interaction.js';
const DETAIL_MODULES=['tasks','calendar','board','matrix','planner','focus','habits','stats'];
export function normalizeDetailPreferences(value){return Object.fromEntries(DETAIL_MODULES.filter(k=>Object.hasOwn(value||{},k)&&typeof value[k]==='boolean').map(k=>[k,value[k]]))}
export function updateDetailPreference(state,module,value){if(!DETAIL_MODULES.includes(module))return state;const next=normalizeDetailPreferences(state.detailPreferences);if(typeof value==='boolean')next[module]=value;else delete next[module];return {...state,detailPreferences:next}}
export const VIEW_PREFS_KEY='todo-view-preferences-v1';
export const defaultView=()=>({sort:'manual',group:'section',order:'asc',collapsedGroups:[],completed:'inherit'});
const allowed=(options,value)=>options.some(([key])=>key===value);
const strings=value=>Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string'&&v.length<=512))].slice(-300):[];
export const groupPreferenceKey=(mode,id)=>JSON.stringify([mode,id]);
export function normalizeView(value){const sort=allowed(SORTS,value?.sort)?value.sort:'manual';return {sort,group:allowed(GROUPS,value?.group)?value.group:'section',order:allowed(ORDERS,value?.order)?value.order:defaultOrder(sort),collapsedGroups:strings(value?.collapsedGroups),completed:['show','hide'].includes(value?.completed)?value.completed:'inherit'}}
export function readViewPreferences(storage){
 try{const value=JSON.parse(storage.getItem(VIEW_PREFS_KEY)||'{}');const views=Object.fromEntries(Object.entries(value?.views||{}).filter(([k])=>k.length<=256).slice(-300).map(([k,v])=>[k,normalizeView(v)]));
 return {views,detailPreferences:normalizeDetailPreferences(value.detailPreferences),pinnedTasks:strings(value.pinnedTasks),showCompleted:value.showCompleted===true,sidebarHidden:value.sidebarHidden===true,collapsed:strings(value.collapsed)};
 }catch{return {views:{},detailPreferences:{},pinnedTasks:[],showCompleted:false,sidebarHidden:false,collapsed:[]}}
}
export function updateViewPreference(state,key,patch){return {...state,views:Object.fromEntries([...Object.entries(state.views).filter(([k])=>k!==key),[key,normalizeView({...Object.hasOwn(state.views,key)?state.views[key]:defaultView(),...patch})]].slice(-300))}}
export function toggleGroupPreference(state,key,mode,id,collapsed){
 const view=Object.hasOwn(state.views,key)?state.views[key]:defaultView(),groupKey=groupPreferenceKey(mode,id),next=new Set(view.collapsedGroups);
 if(collapsed)next.add(groupKey);else next.delete(groupKey);
 return updateViewPreference(state,key,{collapsedGroups:[...next]});
}

export function showCompletedInView(state,key){const mode=Object.hasOwn(state.views,key)?state.views[key].completed:'inherit';return mode==='show'||(mode!=='hide'&&state.showCompleted===true)}
