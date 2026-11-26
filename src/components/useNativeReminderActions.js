import {useEffect,useRef} from 'react';
import {invoke,addPluginListener} from '@tauri-apps/api/core';
import {native,desktopNative} from '../platform/runtime.js';
import {reminderActionTypes,isReminderNavigation} from '../platform/notification-action.js';
export function useNativeReminderActions(onOpen){
 const latest=useRef(onOpen);latest.current=onOpen;
 useEffect(()=>{if(!native)return;let disposed=false,listener;
  const register=async()=>{try{
   const handle=await addPluginListener('notification','actionPerformed',async payload=>{
    if(disposed||!isReminderNavigation(payload))return;
    if(desktopNative){try{const {getCurrentWindow}=await import("@tauri-apps/api/window");const w=getCurrentWindow();await w.show();await w.unminimize();await w.setFocus()}catch{}}
    if(!disposed)latest.current();
   });
   if(disposed){await handle.unregister();return}listener=handle;
   await invoke('plugin:notification|register_action_types',{types:reminderActionTypes()});
  }catch{/* Unsupported action API must not disable existing notification delivery. */}};
  register();return()=>{disposed=true;listener?.unregister().catch(()=>{})};
 },[]);
}
export default function NativeReminderBridge({onOpen}){useNativeReminderActions(onOpen);return null}
