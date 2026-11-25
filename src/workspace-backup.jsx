import React,{useState,useRef,useEffect} from 'react';
import {Modal} from './ui.jsx';
import {createWorkspaceArchive,parseWorkspaceArchive} from './workspace-archive.js';
import {restoreAttachmentArchive} from './attachment-archive.js';
export default function WorkspaceBackup({scope,data,onClose,onRestore,onDownload,blocked}){
 const [candidate,setCandidate]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[restored,setRestored]=useState(false);
 const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);const input=useRef(null);
 async function exportAll(){setBusy(true);setError('');try{const archive=await createWorkspaceArchive(scope,data);if(active.current)onDownload(JSON.stringify(archive),'todo-workspace-'+new Date().toISOString().slice(0,10)+'.json')}catch(e){if(active.current)setError(e.message||String(e))}finally{if(active.current)setBusy(false)}}
 async function inspect(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');setCandidate(null);setRestored(false);try{const result=await parseWorkspaceArchive(file);if(active.current)setCandidate(result)}catch(e){if(active.current)setError(e.message||String(e))}finally{if(active.current)setBusy(false)}}
 async function append(){if(!candidate||restored||!confirm('追加 '+candidate.attachments.length+' 个附件到当前账号？不覆盖现有附件，重复恢复会产生副本。'))return;setBusy(true);setError('');try{await restoreAttachmentArchive(scope,candidate.attachments);if(active.current)setRestored(true)}catch(e){if(active.current)setError(e.message||String(e))}finally{if(active.current)setBusy(false)}}
 return <Modal open onClose={()=>{if(!busy)onClose()}} title="完整工作空间备份"><div className="archive-panel">
 <p className="muted">一个归档包含任务、清单、设置、习惯、专注记录与本机附件，不包含登录凭据、同步基线或私人日历订阅地址。归档未加密，请妥善保管。</p>
 <div className="button-grid"><button className="primary" disabled={busy||blocked} onClick={exportAll}>导出完整归档</button><button className="secondary" disabled={busy} onClick={()=>input.current?.click()}>检查完整归档</button></div><input hidden type="file" ref={input} aria-label="完整归档文件" accept=".json,application/json" onChange={inspect}/>
 {busy&&<p role="status" className="muted">正在处理归档…</p>}{error&&<p role="alert" className="sync-error">{error}</p>}
 {candidate&&<><div className="archive-summary"><strong>完整性校验通过</strong><span>{candidate.workspace.tasks.length} 项任务 · {candidate.workspace.lists.length} 个清单 · {candidate.attachments.length} 个附件</span>{candidate.orphaned>0&&<span>{candidate.orphaned} 个附件在归档中没有对应任务，可从附件管理访问。</span>}</div>
 <p className="muted small">两种存储不能跨数据库原子恢复。先选择恢复工作空间（会替换当前任务数据），再重新打开此归档追加附件；也可只恢复附件。操作前请先备份当前数据。</p>
 <div className="button-grid"><button className="secondary" disabled={busy} onClick={()=>onRestore(candidate.workspace)}>恢复工作空间</button><button className="primary" disabled={busy||restored||!candidate.attachments.length} onClick={append}>{restored?'附件已追加':'追加归档附件'}</button></div></>}
 </div></Modal>
}
