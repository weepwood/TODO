import {useEffect,useRef,useState} from 'react';
import {onOpenUrl} from '@tauri-apps/plugin-deep-link';
import {openUrl} from '@tauri-apps/plugin-opener';
import {createNativeOAuthAttempt} from '../services/native-oauth.js';
// Only active in the main account panel. Cancellation never changes the
// current account; exchange is single-flight and uses the SDK's stored verifier.
export function useNativeOAuth({enabled,authorize,exchange,beforeAccountChange,blocked,onMessage}){
 const attempt=useRef(null);if(!attempt.current)attempt.current=createNativeOAuthAttempt();
 const latest=useRef(null);latest.current={authorize,exchange,beforeAccountChange,blocked,onMessage};
 const timer=useRef(null),mounted=useRef(false);
 const [ready,setReady]=useState(false),[phase,setPhase]=useState('idle');
 const clearTimer=()=>{clearTimeout(timer.current);timer.current=null};
 const reset=(a,message)=>{clearTimer();if(attempt.current.finish(a)&&mounted.current){setPhase('idle');if(message)latest.current.onMessage(message)}};
 useEffect(()=>{
  if(!enabled)return;
  mounted.current=true;let active=true,unlisten;
  onOpenUrl(async urls=>{
   if(!active||!Array.isArray(urls))return;
   for(const raw of urls){
    const result=attempt.current.take(raw);if(!result)continue;
    const {attempt:a,callback}=result;clearTimer();setPhase('exchanging');
    if(callback.kind==='error'){reset(a,'第三方授权已取消或失败，请重试。');return}
    let release;
    try{
     if(latest.current.blocked)throw Error('blocked');
     release=await latest.current.beforeAccountChange?.();
     if(!active||latest.current.blocked)throw Error('blocked');
     await latest.current.exchange(callback.code,a.flowId);
     reset(a,'');
    }catch{reset(a,'无法完成第三方登录，请确认本机数据已保存后重新授权。')}
    finally{release?.()}
    return;
   }
  }).then(dispose=>{if(active){unlisten=dispose;setReady(true)}else dispose()}).catch(()=>{if(active){setReady(false);latest.current.onMessage('无法接收系统浏览器回调，请使用邮箱登录。')}});
  return()=>{active=false;mounted.current=false;clearTimer();attempt.current.cancel();unlisten?.()};
 },[enabled]);
 async function start(provider){
  if(!enabled||!ready||latest.current.blocked)return;
  const a=attempt.current.begin();if(!a)return;
  setPhase('starting');latest.current.onMessage('');let release;
  try{
   release=await latest.current.beforeAccountChange?.();
   if(!attempt.current.owns(a)||!mounted.current)throw Error('cancelled');
   const {url,flowId}=await latest.current.authorize(provider);
   if(!attempt.current.wait(a,flowId)||!mounted.current)throw Error('cancelled');
   setPhase('waiting');
   timer.current=setTimeout(()=>{if(attempt.current.cancel(a)&&mounted.current){setPhase('idle');latest.current.onMessage('授权已超时，请重新登录。')}},Math.max(0,a.deadline-Date.now()));
   release?.();release=null;
   await openUrl(url);
  }catch{if(attempt.current.cancel(a)&&mounted.current){clearTimer();setPhase('idle');latest.current.onMessage('无法打开系统浏览器，请重试。')}}
  finally{release?.()}
 }
 function cancel(){if(attempt.current.cancel()){clearTimer();setPhase('idle');latest.current.onMessage('已取消授权。')}}
 return {ready,phase,start,cancel};
}
