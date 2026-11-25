import React,{useState,useRef,useEffect} from 'react';
import {Modal} from './ui.jsx';
import {createWorkspaceArchive,parseWorkspaceArchive} from './workspace-archive.js';
import {restoreAttachmentArchive} from './attachment-archive.js';
import {readRecoveryHistory,recordRecovery,clearRecoveryHistory} from './recovery-history.js';
export default function WorkspaceBackup({scope,data,onClose,onRestore,onDownload,blocked,historyStorage}){
 const [candidate,setCandidate]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[restored,setRestored]=useState(null);
 const [history,setHistory]=useState(()=>readRecoveryHistory(historyStorage));
 function log(kind,counts){if(recordRecovery(historyStorage,kind,counts))setHistory(readRecoveryHistory(historyStorage))}
 const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);const input=useRef(null);
 async function exportAll(){setBusy(true);setError('');try{const archive=await createWorkspaceArchive(scope,data);if(active.current){onDownload(JSON.stringify(archive),'todo-workspace-'+new Date().toISOString().slice(0,10)+'.json');log('export',{tasks:archive.workspace.tasks.length,lists:archive.workspace.lists.length,attachments:archive.attachments.entries.length})}}catch(e){if(active.current)setError(e.message||String(e))}finally{if(active.current)setBusy(false)}}
 async function inspect(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');setCandidate(null);setRestored(null);try{const result=await parseWorkspaceArchive(file);if(active.current)setCandidate(result)}catch(e){if(active.current)setError(e.message||String(e))}finally{if(active.current)setBusy(false)}}
 async function append(){if(!candidate||restored||!confirm('追加 '+candidate.attachments.length+' 个附件到当前账号？不覆盖现有附件，相同任务、名称与内容的附件将跳过。'))return;setBusy(true);setError('');try{const result=await restoreAttachmentArchive(scope,candidate.attachments);if(active.current){setRestored(result);log('restore-attachments',result)}}catch(e){if(active.current)setError(e.message||String(e))}finally{if(active.current)setBusy(false)}}
 return <Modal open onClose={()=>{if(!busy)onClose()}} title="完整工作空间备份"><div className="archive-panel">
 <p className="muted">一个归档包含任务、清单、设置、习惯、专注记录与本机附件，不包含登录凭据、同步基线或私人日历订阅地址。归档未加密，请妥善保管。</p>
 <div className="button-grid"><button className="primary" disabled={busy||blocked} onClick={exportAll}>导出完整归档</button><button className="secondary" disabled={busy} onClick={()=>input.current?.click()}>检查完整归档</button></div><input hidden type="file" ref={input} aria-label="完整归档文件" accept=".json,application/json" onChange={inspect}/>
 {busy&&<p role="status" className="muted">正在处理归档…</p>}{error&&<p role="alert" className="sync-error">{error}</p>}
 {candidate&&<><div className="archive-summary"><strong>完整性校验通过</strong><span>当前工作空间：{data.tasks.length} 项任务 · {data.lists.length} 个清单</span><span>归档内容：{candidate.workspace.tasks.length} 项任务 · {candidate.workspace.lists.length} 个清单 · {candidate.attachments.length} 个附件</span>{candidate.orphaned>0&&<span>{candidate.orphaned} 个附件在归档中没有对应任务，可从附件管理访问。</span>}</div>
 <p className="muted small">两种存储不能跨数据库原子恢复。先选择恢复工作空间（会替换当前任务数据），再重新打开此归档追加附件；也可只恢复附件。操作前请先备份当前数据。</p>
 <div className="button-grid"><button className="secondary" disabled={busy} onClick={()=>onRestore(candidate.workspace)}>恢复工作空间</button><button className="primary" disabled={busy||!!restored||!candidate.attachments.length} onClick={append}>{restored?'附件已追加':'追加归档附件'}</button></div>{restored&&<p role="status" className="muted">新增 {restored.added} 个附件，跳过 {restored.skipped} 个重复附件。</p>}</>}
 <details className="sync-diagnostics"><summary>本机备份与恢复记录</summary><p className="muted small">最近 30 次操作，仅记录时间和数量；导出记录表示已请求下载，不保证文件已经保存。恢复工作空间记录表示已载入，实际 SQLite 写入状态请查看状态栏。</p>{history.length?history.map((r,i)=><div className="record-row" key={r.at+i}><span>{r.kind==='export'?'请求导出完整归档':r.kind==='restore-workspace'?'载入工作空间':'附件恢复完成'}<small className="backup-size"> · {r.tasks!==undefined?r.tasks+' 项任务':r.added!==undefined?'新增 '+r.added+' / 跳过 '+r.skipped:''}</small></span><small>{new Date(r.at).toLocaleString()}</small></div>):<p className="muted small">暂无记录</p>}<button type="button" className="text-link" disabled={busy} onClick={()=>{if(clearRecoveryHistory(historyStorage))setHistory([])}}>清空操作记录</button></details>
 </div></Modal>
}
