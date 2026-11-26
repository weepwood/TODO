import React,{useEffect,useState} from 'react';
import {createCompatibleLegacyStore} from '../services/compatible-legacy-store.js';
import {assertLegacyWriter} from '../services/storage-switch-protocol.js';
// Isolated rehearsal of the actual legacy application, not a released writer.
export default function WebCompatibleLegacy({render}){
 const [result,setResult]=useState({status:'loading'});
 useEffect(()=>{
  let alive=true,owned=false,release;const hold=new Promise(r=>release=r);
  if(!navigator.locks){setResult({status:'blocked',error:'浏览器不支持独占锁'});return}
  navigator.locks.request('todo-account-guest',{ifAvailable:true},async lock=>{
   if(!alive)return;
   if(!lock){setResult({status:'blocked',error:'旧存储无法取得独占锁'});return}
   owned=true;
   try{assertLegacyWriter(localStorage);const storage=createCompatibleLegacyStore(localStorage,()=>alive&&owned);setResult({status:'ready',storage});await hold}
   catch(e){if(alive)setResult({status:'blocked',error:String(e)})}
   finally{owned=false}
  }).catch(e=>{if(alive)setResult({status:'blocked',error:String(e)})});
  return()=>{alive=false;owned=false;release()};
 },[]);
 if(result.status==='blocked')return <main className="account-gate"><p role="alert">{result.error}</p><button onClick={()=>location.reload()}>重新打开</button></main>;
 if(result.status!=='ready')return <main className="account-gate" role="status">正在打开兼容旧工作空间…</main>;
 return render({ready:true,storage:result.storage,error:'',pending:false,saveError:'',pilot:true,legacyCompatible:true});
}
