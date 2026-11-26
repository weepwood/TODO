import React,{useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {SettingsGroup} from './SettingsLayout.jsx';
import {ActionButton} from '../ui.jsx';
export function LocalCliPanel({scope,blocked}){
 const [bound,setBound]=useState(null),[advanced,setAdvanced]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;Promise.all([invoke('native_cli_binding',{scope,action:'read'}),invoke('native_cli_binding',{scope,action:'read-advanced'})]).then(([v,a])=>{if(active){setBound(v);setAdvanced(a)}}).catch(()=>{if(active)setMessage('工作空间尚未就绪')});return()=>{active=false}},[scope]);
 async function change(action){setBusy(true);setMessage('');try{const value=await invoke('native_cli_binding',{scope,action});if(action.startsWith('advanced-'))setAdvanced(value);else{setBound(value);if(!value)setAdvanced(false)}}catch(e){setMessage(String(e))}finally{setBusy(false)}}
 return <SettingsGroup title="本地 CLI 接入" description="允许本机命令行向明确绑定的工作空间录入任务，不随账号切换。无云端授权要求。">
 <div className="button-grid"><ActionButton disabled={busy||blocked||bound===true} onClick={()=>change('bind')}>绑定当前工作空间</ActionButton><ActionButton disabled={busy||bound!==true} onClick={()=>change('unbind')}>解除绑定</ActionButton></div>
 {bound===true&&<div className="record-row"><span>高级 CLI 权限<small>允许本机已授权工具查询任务、修改属性、完成任务、管理分类及专注习惯；关闭后只可录入新任务。</small></span><ActionButton disabled={busy||blocked} onClick={()=>{if(advanced||window.confirm('授权本机命令行读取和修改当前工作空间？'))change(advanced?'advanced-off':'advanced-on')}}>{advanced?'关闭高级权限':'启用高级权限'}</ActionButton></div>}
 <p role="status" className="muted small">{message||(bound===true?'当前工作空间已绑定':bound===false?'当前工作空间未绑定':'正在检查绑定')}</p>
 </SettingsGroup>
}
