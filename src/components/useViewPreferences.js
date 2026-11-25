import {useState,useRef} from 'react';
import {VIEW_PREFS_KEY,readViewPreferences,defaultView,updateViewPreference,groupPreferenceKey,toggleGroupPreference,showCompletedInView,updateDetailPreference} from '../core/view-preferences.js';
export function useViewPreferences(storage,key){
 const [state,setState]=useState(()=>readViewPreferences(storage)),latest=useRef(state);
 const [error,setError]=useState(false);
 function update(fn){const next=fn(latest.current);latest.current=next;setState(next);try{storage.setItem(VIEW_PREFS_KEY,JSON.stringify(next));setError(false)}catch{setError(true)}}
 const current=Object.hasOwn(state.views,key)?state.views[key]:defaultView();
 return {...current,detailPreferences:state.detailPreferences,setDetailPreference:(module,value)=>update(s=>updateDetailPreference(s,module,value)),pinnedTasks:state.pinnedTasks||[],togglePin:id=>update(s=>({...s,pinnedTasks:(s.pinnedTasks||[]).includes(id)?s.pinnedTasks.filter(x=>x!==id):[...(s.pinnedTasks||[]),id].slice(-300)})),showCompleted:showCompletedInView(state,key),defaultShowCompleted:state.showCompleted===true,setDefaultShowCompleted:value=>update(s=>({...s,showCompleted:value===true})),sidebarHidden:state.sidebarHidden,collapsed:state.collapsed,error,
 isGroupCollapsed:(mode,id)=>current.collapsedGroups.includes(groupPreferenceKey(mode,id)),
 setGroupCollapsed:(mode,id,collapsed)=>update(s=>toggleGroupPreference(s,key,mode,id,collapsed)),
 setView:patch=>update(s=>updateViewPreference(s,key,patch)),
 setSidebarHidden:fn=>update(s=>({...s,sidebarHidden:typeof fn==='function'?fn(s.sidebarHidden):fn})),
 setCollapsed:fn=>update(s=>({...s,collapsed:typeof fn==='function'?fn(s.collapsed):fn}))}
}
