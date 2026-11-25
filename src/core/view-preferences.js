import {SORTS,GROUPS,ORDERS,defaultOrder} from './task-list-interaction.js';
export const VIEW_PREFS_KEY='todo-view-preferences-v1';
export const defaultView=()=>({sort:'manual',group:'section',order:'asc'});
const allowed=(options,value)=>options.some(([key])=>key===value);
export function normalizeView(value){const sort=allowed(SORTS,value?.sort)?value.sort:'manual';return {sort,group:allowed(GROUPS,value?.group)?value.group:'section',order:allowed(ORDERS,value?.order)?value.order:defaultOrder(sort)}}
export function readViewPreferences(storage){
 try{const value=JSON.parse(storage.getItem(VIEW_PREFS_KEY)||'{}');const views=Object.fromEntries(Object.entries(value?.views||{}).filter(([k])=>k.length<=256).slice(-300).map(([k,v])=>[k,normalizeView(v)]));
 return {views,sidebarHidden:value.sidebarHidden===true,collapsed:Array.isArray(value.collapsed)?value.collapsed.filter(v=>typeof v==='string').slice(0,300):[]};
 }catch{return {views:{},sidebarHidden:false,collapsed:[]}}
}
export function updateViewPreference(state,key,patch){return {...state,views:Object.fromEntries([...Object.entries(state.views).filter(([k])=>k!==key),[key,normalizeView({...Object.hasOwn(state.views,key)?state.views[key]:defaultView(),...patch})]].slice(-300))}}
