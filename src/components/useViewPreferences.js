import {useState,useRef} from 'react';
import {VIEW_PREFS_KEY,readViewPreferences,defaultView,updateViewPreference,groupPreferenceKey,toggleGroupPreference} from '../core/view-preferences.js';
export function useViewPreferences(storage,key){
 const [state,setState]=useState(()=>readViewPreferences(storage)),latest=useRef(state);
 const [error,setError]=useState(false);
 function update(fn){const next=fn(latest.current);latest.current=next;setState(next);try{storage.setItem(VIEW_PREFS_KEY,JSON.stringify(next));setError(false)}catch{setError(true)}}
 const current=Object.hasOwn(state.views,key)?state.views[key]:defaultView();
 return {...current,sidebarHidden:state.sidebarHidden,collapsed:state.collapsed,error,
 isGroupCollapsed:(mode,id)=>current.collapsedGroups.includes(groupPreferenceKey(mode,id)),
 setGroupCollapsed:(mode,id,collapsed)=>update(s=>toggleGroupPreference(s,key,mode,id,collapsed)),
 setView:patch=>update(s=>updateViewPreference(s,key,patch)),
 setSidebarHidden:fn=>update(s=>({...s,sidebarHidden:typeof fn==='function'?fn(s.sidebarHidden):fn})),
 setCollapsed:fn=>update(s=>({...s,collapsed:typeof fn==='function'?fn(s.collapsed):fn}))}
}
