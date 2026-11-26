import React,{useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {SettingsGroup} from './SettingsLayout.jsx';
import {ActionButton} from '../ui.jsx';
export function LocalCliPanel({scope,blocked}){
 const [bound,setBound]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;invoke('native_cli_binding',{scope,action:'read'}).then(v=>{if(active)setBound(v)}).catch(()=>{if(active)setMessage('工作空间尚未就绪')});return()=>{active=false}},[scope]);
 async function change(action){setBusy(true);setMessage('');try{setBound(await invoke('native_cli_binding',{scope,action}))}catch(e){setMessage(String(e))}finally{setBusy(false)}}
 return <SettingsGroup title="本地 CLI 接入" description="允许本机命令行向明确绑定的工作空间录入任务，不随账号切换。无云端授权要求。">
 <div className="button-grid"><ActionButton disabled={busy||blocked||bound===true} onClick={()=>change('bind')}>绑定当前工作空间</ActionButton><ActionButton disabled={busy||bound!==true} onClick={()=>change('unbind')}>解除绑定</ActionButton></div>
 <p role="status" className="muted small">{message||(bound===true?'当前工作空间已绑定':bound===false?'当前工作空间未绑定':'正在检查绑定')}</p>
 </SettingsGroup>
}
