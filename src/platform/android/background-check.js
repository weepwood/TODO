import {useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {CLOUD_URL,CLOUD_KEY} from '../../cloud-config.js';
import {revisionIntent} from './revision-intent.js';
const key=uid=>'todo-android-background-check:'+uid;
const messages={'waiting':'等待系统安排检查','unchanged':'云端版本未变化','remote-changed':'云端有新版本，返回前台后同步','pending-upload':'本机有待上传修改，返回前台后同步','reconcile':'两端版本有变化，等待前台冲突判定','needs-login':'会话已过期，等待前台恢复登录','offline':'网络暂不可用','unavailable':'云端检查未成功'};
export function useAndroidBackgroundCheck({enabled,uid,storage,data,blocked,lastSync}){
 const [active,setActive]=useState(()=>!!enabled&&!!uid&&localStorage.getItem(key(uid))==='1'),[status,setStatus]=useState('');
 useEffect(()=>{if(!enabled||!uid||!active||blocked)return;let disposed=false;
 const configure=async()=>{try{const args=await revisionIntent({uid,storage,data,url:CLOUD_URL,key:CLOUD_KEY});if(disposed)return;await invoke('plugin:todo-mobile|revision_configure',args);if(!disposed)setStatus('已提交系统后台版本检查请求')}catch(e){if(!disposed)setStatus(String(e))}};
 const t=setTimeout(configure,500);return()=>{disposed=true;clearTimeout(t)}
 },[enabled,uid,active,storage,data,blocked,lastSync]);
 useEffect(()=>{if(!enabled||!uid||!active)return;let disposed=false;
 const refresh=async()=>{if(document.visibilityState==='hidden')return;try{const r=await invoke('plugin:todo-mobile|revision_status');if(!disposed&&(!r.scope||r.scope===uid))setStatus((messages[r.state]||messages.waiting)+(r.checkedAt?' · '+new Date(r.checkedAt).toLocaleString():''));
 }catch(e){if(!disposed)setStatus(String(e))}};
 const timer=setInterval(refresh,15000);window.addEventListener('todo-native-resume',refresh);refresh();return()=>{disposed=true;clearInterval(timer);window.removeEventListener('todo-native-resume',refresh)}
 },[enabled,uid,active]);
 const toggle=async()=>{if(!uid)return;try{
  if(active){await invoke('plugin:todo-mobile|revision_cancel');localStorage.removeItem(key(uid));setActive(false);setStatus('后台版本检查已关闭')}
  else{if(blocked)throw Error('请先恢复本机保存');const args=await revisionIntent({uid,storage,data,url:CLOUD_URL,key:CLOUD_KEY});await invoke('plugin:todo-mobile|revision_configure',args);localStorage.setItem(key(uid),'1');setActive(true)}
 }catch(e){setStatus(String(e))}};
 return {active,status,toggle}
}
