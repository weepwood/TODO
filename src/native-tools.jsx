import React,{useEffect,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {Modal} from './ui.jsx';
import {native} from './native.js';
import {migrateState} from './core/domain.js';
export function useNativeSearch({uid,query,tasks,pending}){
 const [result,setResult]=useState(null);
 useEffect(()=>{if(!native||pending||!query.trim())return;let active=true;
 const delay=setTimeout(()=>invoke('native_search',{scope:uid||'guest',query:query.trim()}).then(ids=>{if(active&&Array.isArray(ids))setResult({tasks,query,ids:new Set(ids)})}).catch(()=>{if(active)setResult(null)}),120);
 return()=>{active=false;clearTimeout(delay)}
 },[uid,query,tasks,pending]);
 return !pending&&result?.query===query&&result.tasks===tasks?result.ids:null;
}
export function BackupHistory({open,onClose,uid,storage,onRestore,onDownload}){
 const [items,setItems]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const scope=uid||'guest';
 async function refresh(){setError('');try{const list=await invoke('native_list_backups',{scope});setItems(list||[])}catch(e){setError(String(e))}}
 useEffect(()=>{if(open)refresh()},[open,uid]);
 async function backup(){setBusy(true);try{if(!await storage.flush())throw Error('本地保存尚未成功');await invoke('native_create_backup',{scope});await refresh()}catch(e){setError(String(e))}finally{setBusy(false)}}
 async function read(item,restore){setBusy(true);try{const body=await invoke('native_read_backup',{scope,savedAt:item.saved_at});if(!body)throw Error('备份不存在或已轮换');const state=migrateState(JSON.parse(body));if(restore){if(!await storage.flush())throw Error('当前工作空间尚未保存');await invoke('native_create_backup',{scope});onRestore(state)}else onDownload(JSON.stringify(state,null,2),'todo-backup-'+item.saved_at+'.json')}catch(e){setError(String(e))}finally{setBusy(false)}}
 return <Modal open={open} onClose={onClose} title="SQLite 备份历史"><p className="muted">最近 24 份本机快照。恢复前额外备份当前工作空间，恢复仍需确认。</p><div className="button-grid"><button className="primary" disabled={busy} onClick={backup}>创建快照</button><button className="secondary" disabled={busy} onClick={refresh}>刷新</button></div>{error&&<p role="alert" className="sync-error">{error}</p>}{!items.length&&!error&&<p className="muted">暂无历史快照</p>}{items.map(item=><div className="record-row" key={item.saved_at}><span>{new Date(item.saved_at*1000).toLocaleString()}<small className="backup-size"> · {(item.bytes/1024).toFixed(1)} KB</small></span><button className="text-link" disabled={busy} onClick={()=>read(item,false)}>导出</button><button className="text-link" disabled={busy} onClick={()=>read(item,true)}>恢复</button></div>)}</Modal>
}
