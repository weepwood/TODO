import {mergePortablePreferences,replaceLocalPreferences,restoreLocalPreferences} from '../core/preference-sync.js';
import {archivePreference} from '../core/archive-review.js';
import {useState,useRef} from 'react';
import {VIEW_PREFS_KEY,readViewPreferences,defaultView,updateViewPreference,groupPreferenceKey,toggleGroupPreference,showCompletedInView,updateDetailPreference} from '../core/view-preferences.js';
export function useViewPreferences(storage,key){
 const [state,setState]=useState(()=>readViewPreferences(storage)),latest=useRef(state);
 const [error,setError]=useState(false);
 function update(fn){const next=fn(latest.current);latest.current=next;setState(next);try{storage.setItem(VIEW_PREFS_KEY,JSON.stringify(next));setError(false)}catch{setError(true)}}
 const current=Object.hasOwn(state.views,key)?state.views[key]:defaultView();
 function replace(fn){try{const next=fn();latest.current=next;setState(next);setError(false);return true}catch{setError(true);return false}}
 return {...current,portableState:state,applyProfile:profile=>replace(()=>replaceLocalPreferences(storage,mergePortablePreferences(latest.current,profile))),restoreProfile:()=>replace(()=>restoreLocalPreferences(storage)),archivedLists:state.archivedLists,setListArchived:(id,value)=>update(s=>archivePreference(s,id,value)),favoriteLists:state.favoriteLists,toggleFavoriteList:id=>update(s=>({...s,favoriteLists:s.favoriteLists.includes(id)?s.favoriteLists.filter(x=>x!==id):[...s.favoriteLists,id].slice(-300)})),taskDefaults:state.taskDefaults,setTaskDefaults:(id,value)=>update(s=>({...s,taskDefaults:Object.fromEntries([...Object.entries(s.taskDefaults).filter(([k])=>k!==id),...(value?[[id,value]]:[])].slice(-300))})),detailPreferences:state.detailPreferences,setDetailPreference:(module,value)=>update(s=>updateDetailPreference(s,module,value)),pinnedTasks:state.pinnedTasks||[],togglePin:id=>update(s=>({...s,pinnedTasks:(s.pinnedTasks||[]).includes(id)?s.pinnedTasks.filter(x=>x!==id):[...(s.pinnedTasks||[]),id].slice(-300)})),showCompleted:showCompletedInView(state,key),defaultShowCompleted:state.showCompleted===true,setDefaultShowCompleted:value=>update(s=>({...s,showCompleted:value===true})),sidebarHidden:state.sidebarHidden,collapsed:state.collapsed,error,
 isGroupCollapsed:(mode,id)=>current.collapsedGroups.includes(groupPreferenceKey(mode,id)),
 setGroupCollapsed:(mode,id,collapsed)=>update(s=>toggleGroupPreference(s,key,mode,id,collapsed)),
 setView:patch=>update(s=>updateViewPreference(s,key,patch)),
 setSidebarHidden:fn=>update(s=>({...s,sidebarHidden:typeof fn==='function'?fn(s.sidebarHidden):fn})),
 setCollapsed:fn=>update(s=>({...s,collapsed:typeof fn==='function'?fn(s.collapsed):fn}))}
}
