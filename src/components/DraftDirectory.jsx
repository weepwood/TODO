import React,{useMemo,useState} from 'react';
import {Modal,ActionButton} from '../ui.jsx';
import {SearchField} from '../design-system/Controls.jsx';
import {listDrafts,removeDraft} from '../core/draft-directory.js';
const labels={current:'原文一致',stale:'原文已变化',orphaned:'任务已删除或不存在',invalid:'记录异常'};
export default function DraftDirectory({storage,tasks,onClose,onOpen}){
 const [revision,setRevision]=useState(0),[query,setQuery]=useState(''),[message,setMessage]=useState('');
 const rows=useMemo(()=>listDrafts(storage,tasks),[storage,tasks,revision]),visible=rows.filter(r=>(r.title+' '+(r.text||'')).toLowerCase().includes(query.toLowerCase()));
 return <Modal open title="本机草稿管理" onClose={onClose} description="只管理显式保留的备注草稿，不进入同步或完整归档。过期草稿不会覆盖任务。"><SearchField aria-label="搜索备注草稿" value={query} onValueChange={setQuery}/><p className="muted small">{visible.length} / {rows.length} 份草稿</p><div className="professional-preview">{visible.map(r=><section className="review-section" key={r.id}><div className="record-row"><strong>{r.title}</strong><small>{labels[r.status]}</small></div>{r.at&&<small>{new Date(r.at).toLocaleString()}</small>}{r.status!=='invalid'?<details><summary>查看草稿</summary><textarea readOnly aria-label={'草稿 '+r.title} value={r.text} rows={4}/></details>:<p role="alert">{r.error}</p>}<div className="workspace-actions">{r.status==='current'&&<ActionButton compact onClick={()=>onOpen(r.id)}>打开任务</ActionButton>}{r.status!=='invalid'&&<><ActionButton compact onClick={()=>{const url=URL.createObjectURL(new Blob([r.text],{type:'text/markdown;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='todo-draft.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}>导出草稿</ActionButton><button className="text-link" onClick={()=>{if(confirm('删除此本机草稿？不会改变任务备注。'))try{removeDraft(storage,r);setRevision(v=>v+1);setMessage('草稿已删除')}catch(e){setMessage(e.message)}}}>删除草稿</button></>}</div></section>)}</div>{message&&<p role="status">{message}</p>}</Modal>
}
