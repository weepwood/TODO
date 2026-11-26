import {androidNative} from '../platform/runtime.js';
import {invoke} from '@tauri-apps/api/core';
import React,{useState,useMemo} from 'react';
import {Modal,Field,ActionButton} from '../ui.jsx';
import {SmartSelect,SelectOption} from './SmartSelect.jsx';
import {readAssociation,saveAssociation,obsidianURI,associationKey,historicalSearch} from '../core/local-knowledge.js';
export function ObsidianAssociation({task,storage,locked}){
 const [row,setRow]=useState(()=>{try{return readAssociation(storage,task.id)}catch{return null}}),[vault,setVault]=useState(row?.vault||''),[file,setFile]=useState(row?.file||''),[message,setMessage]=useState('');
 const uri=row&&obsidianURI(row.vault,row.file);
 return <details className="local-knowledge"><summary>Obsidian 本机关联</summary><p className="muted small">仅保存知识库名称及相对笔记路径，不扫描、写入或同步知识库。</p>{!locked&&<><Field label="知识库"><input aria-label="Obsidian 知识库" value={vault} onChange={e=>setVault(e.target.value)} maxLength={100}/></Field><Field label="笔记路径"><input aria-label="Obsidian 笔记路径" value={file} onChange={e=>setFile(e.target.value)} maxLength={500} placeholder="项目/记录.md"/></Field><ActionButton compact disabled={!obsidianURI(vault,file)} onClick={()=>{try{setRow(saveAssociation(storage,task.id,vault,file));setMessage('关联已保存')}catch(e){setMessage(e.message)}}}>保存笔记关联</ActionButton></>}
 {uri&&<div className="workspace-actions"><a href={uri} className="text-link" rel="noreferrer">打开笔记</a><button className="text-link" onClick={async()=>{try{await navigator.clipboard.writeText(uri);setMessage('链接已复制')}catch{setMessage('无法复制，请选择下方链接文本')}}}>复制链接</button>{!locked&&<button className="text-link" onClick={()=>{if(confirm('移除本机关联？不会删除笔记。'))try{storage.removeItem(associationKey(task.id));setRow(null);setMessage('已移除')}catch(e){setMessage(e.message)}}}>移除关联</button>}</div>}{uri&&<input aria-label="Obsidian 关联链接" value={uri} readOnly/>}{message&&<p role="status">{message}</p>}</details>
}
export function HistorySearch({data,archived,onClose,onOpen}){
 const [query,setQuery]=useState(''),[kind,setKind]=useState('all'),[limit,setLimit]=useState(50);
 const rows=useMemo(()=>historicalSearch(data,archived,query,kind),[data,archived,query,kind]);
 return <Modal open title="历史归档检索" onClose={onClose} description="只读搜索已完成、已跳过和归档清单中的任务，不包括回收站。"><input aria-label="历史搜索" value={query} onChange={e=>{setQuery(e.target.value);setLimit(50)}} placeholder="搜索标题、备注、清单…"/><SmartSelect aria-label="历史范围" value={kind} onValueChange={v=>{setKind(v);setLimit(50)}}>{[['all','全部历史'],['completed','已完成'],['skipped','已跳过'],['archived','归档清单']].map(([v,n])=><SelectOption key={v} value={v}>{n}</SelectOption>)}</SmartSelect><p className="muted small">{rows.length} 项结果</p><div className="professional-preview">{rows.slice(0,limit).map(t=><div className="record-row" key={t.id}><button className="text-link" onClick={()=>onOpen(t)}>{t.title}</button><small>{data.lists.find(l=>l.id===t.listId)?.name} · {t.completedAt?.slice(0,10)||t.date||'未安排'}</small></div>)}</div>{limit<rows.length&&<ActionButton onClick={()=>setLimit(v=>v+50)}>加载更多</ActionButton>}</Modal>
}

export function ShareTask({task}){
 const [message,setMessage]=useState('');
 const text=task.title+(task.date?' · '+task.date+(task.time?' '+task.time:''):'');
 return <div className="workspace-actions"><button type="button" className="secondary compact" onClick={async()=>{try{if(androidNative){await invoke('plugin:todo-mobile|share_summary',{text});setMessage('已请求打开系统分享面板');return}if(typeof navigator.share!=='function'){setMessage('此环境不支持系统分享，可使用复制任务摘要。');return}await navigator.share({title:'TODO',text});setMessage('系统分享面板已返回（不保证接收方已收到）')}catch(e){if(e.name!=='AbortError')setMessage('系统分享不可用，可复制摘要')}}}>分享任务摘要</button><button type="button" className="text-link" onClick={async()=>{try{await navigator.clipboard.writeText(text);setMessage('摘要已复制')}catch{setMessage('无法复制，请选择任务标题')}}}>复制任务摘要</button>{message&&<small role="status">{message}</small>}</div>
}
