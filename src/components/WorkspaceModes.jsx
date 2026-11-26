import React,{useState} from 'react';
import {Modal,Field,ActionButton} from '../ui.jsx';
import {saveMode,deleteMode} from '../core/workspace-modes.js';
export default function WorkspaceModes({storage,rows,snapshot,onRows,onApply,onClose}){
 const [name,setName]=useState(''),[message,setMessage]=useState('');
 return <Modal open title="命名工作模式" onClose={onClose} description="保存当前模块、任务视图、面板宽度和显示状态。仅本机，不保存任务或查询结果。"><Field label="模式名称"><input aria-label="工作模式名称" value={name} maxLength={60} onChange={e=>setName(e.target.value)}/></Field><ActionButton disabled={!name.trim()} onClick={()=>{try{onRows(saveMode(storage,name,snapshot));setName('');setMessage('已保存')}catch(e){setMessage(e.message)}}}>保存当前工作模式</ActionButton><div className="professional-preview">{rows.map(r=><div className="record-row" key={r.name}><span>{r.name}<small>{r.module} · {r.sidebarHidden?'隐藏侧栏':'显示侧栏'} · {r.detailVisible?'显示详情':'隐藏详情'}</small></span><ActionButton compact onClick={()=>{if(onApply(r))onClose()}}>应用 {r.name}</ActionButton><button className="text-link" onClick={()=>{if(confirm('删除该工作模式？'))try{onRows(deleteMode(storage,r.name))}catch(e){setMessage(e.message)}}}>删除</button></div>)}</div>{message&&<p role="status">{message}</p>}</Modal>
}
