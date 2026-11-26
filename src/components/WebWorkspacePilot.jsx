import React,{useEffect,useState} from 'react';
import {openPilotDatabase,createWebPilotStore,readRawPilotRecord,legacySnapshot} from '../services/web-workspace-store.js';
import {useAccountLock} from '../cloud.jsx';

// Only loaded by the explicit loopback test gate. No account/cloud/native
// migration is attempted. The existing guest lock is shared with normal Web.
export default function WebWorkspacePilot({render}){
 const lock=useAccountLock('guest'),[result,setResult]=useState({ready:false,storage:null,error:'',pending:false,saveError:'',pilot:true});
 useEffect(()=>{if(lock!=='ready')return;let alive=true,db;
  (async()=>{try{db=await openPilotDatabase();if(!alive){db.close();return}const storage=await createWebPilotStore(db,localStorage,status=>{if(alive)setResult(old=>({...old,pending:status.pending,saveError:status.error}))});if(alive)setResult({ready:true,storage,error:'',pending:false,saveError:'',pilot:true})}catch(e){if(alive)setResult(old=>({...old,ready:true,error:String(e)}))}})();
  return()=>{alive=false;db?.close()};
 },[lock]);
 const exportRecovery=async()=>{let db;try{db=await openPilotDatabase();const record=await readRawPilotRecord(db),url=URL.createObjectURL(new Blob([JSON.stringify({record,legacy:legacySnapshot(localStorage)},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='todo-pilot-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){alert(String(e))}finally{db?.close()}};
 if(lock==='busy'||lock==='unsupported')return <div className="account-gate"><h2>试验工作空间无法取得独占锁</h2><button onClick={()=>location.reload()}>重试</button></div>;
 if(result.error)return <div className="account-gate"><h2>IndexedDB 试验工作空间读取失败</h2><p role="alert">{result.error}</p><button onClick={()=>location.reload()}>重试</button><button onClick={exportRecovery}>导出原始恢复数据</button></div>;
 if(!result.ready)return <div className="account-gate" role="status">正在读取 IndexedDB 试验工作空间…</div>;
 return render(result);
}
