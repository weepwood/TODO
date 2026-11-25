import {useEffect} from 'react';
import {native} from '../../platform/runtime.js';
import {newerRelease,readFeed,releaseChannel} from './protocol.js';
import pkg from '../../../package.json';
export function useAutoUpdate(onNotice){
 useEffect(()=>{if(!native||localStorage.getItem('todo-update-auto')==='0')return;
 const channel=releaseChannel(pkg.version),key='todo-update-last-check:'+channel;
 if(Date.now()-Number(localStorage.getItem(key)||0)<12*3600000)return;
 const controller=new AbortController();let timeout;
 const t=setTimeout(async()=>{try{timeout=setTimeout(()=>controller.abort(),12000);
 const r=await readFeed(channel,{signal:controller.signal});localStorage.setItem(key,String(Date.now()));
 if(newerRelease(r,pkg.version))onNotice('发现软件更新 V'+r.version+'，请前往设置检查更新。');
 }catch{}finally{clearTimeout(timeout)}},2000);
 return()=>{clearTimeout(t);clearTimeout(timeout);controller.abort()}
 },[]);
}
