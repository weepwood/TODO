import {SORTS,GROUPS,ORDERS,defaultOrder} from './task-list-interaction.js';
export const VIEW_PREFS_KEY='todo-view-preferences-v1';
export const defaultView=()=>({sort:'manual',group:'section',order:'asc',collapsedGroups:[]});
const allowed=(options,value)=>options.some(([key])=>key===value);
const strings=value=>Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string'&&v.length<=512))].slice(-300):[];
export const groupPreferenceKey=(mode,id)=>JSON.stringify([mode,id]);
export function normalizeView(value){const sort=allowed(SORTS,value?.sort)?value.sort:'manual';return {sort,group:allowed(GROUPS,value?.group)?value.group:'section',order:allowed(ORDERS,value?.order)?value.order:defaultOrder(sort),collapsedGroups:strings(value?.collapsedGroups)}}
export function readViewPreferences(storage){
 try{const value=JSON.parse(storage.getItem(VIEW_PREFS_KEY)||'{}');const views=Object.fromEntries(Object.entries(value?.views||{}).filter(([k])=>k.length<=256).slice(-300).map(([k,v])=>[k,normalizeView(v)]));
 return {views,sidebarHidden:value.sidebarHidden===true,collapsed:strings(value.collapsed)};
 }catch{return {views:{},sidebarHidden:false,collapsed:[]}}
}
export function updateViewPreference(state,key,patch){return {...state,views:Object.fromEntries([...Object.entries(state.views).filter(([k])=>k!==key),[key,normalizeView({...Object.hasOwn(state.views,key)?state.views[key]:defaultView(),...patch})]].slice(-300))}}
export function toggleGroupPreference(state,key,mode,id,collapsed){
 const view=Object.hasOwn(state.views,key)?state.views[key]:defaultView(),groupKey=groupPreferenceKey(mode,id),next=new Set(view.collapsedGroups);
 if(collapsed)next.add(groupKey);else next.delete(groupKey);
 return updateViewPreference(state,key,{collapsedGroups:[...next]});
}
