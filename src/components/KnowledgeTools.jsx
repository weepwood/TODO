import {androidNative,desktopNative} from '../platform/runtime.js';
import {invoke} from '@tauri-apps/api/core';
import React,{useState,useMemo,useEffect} from 'react';
import {Modal,Field,ActionButton} from '../ui.jsx';
import {SmartSelect,SelectOption} from './SmartSelect.jsx';
import {readAssociation,saveAssociation,obsidianURI,associationKey,historicalSearch} from '../core/local-knowledge.js';
export function ObsidianAssociation({task,storage,locked}){
 const [row,setRow]=useState(()=>{try{return readAssociation(storage,task.id)}catch{return null}}),[vault,setVault]=useState(row?.vault||''),[file,setFile]=useState(row?.file||''),[message,setMessage]=useState('');
 const uri=row&&obsidianURI(row.vault,row.file);
 return <details className="local-knowledge"><summary>Obsidian 本机关联</summary><p className="muted small">仅保存知识库名称及相对笔记路径，不扫描、写入或同步知识库。</p>{!locked&&<><Field label="知识库"><input aria-label="Obsidian 知识库" value={vault} onChange={e=>setVault(e.target.value)} maxLength={100}/></Field><Field label="笔记路径"><input aria-label="Obsidian 笔记路径" value={file} onChange={e=>setFile(e.target.value)} maxLength={500} placeholder="项目/记录.md"/></Field><ActionButton compact disabled={!obsidianURI(vault,file)} onClick={()=>{try{setRow(saveAssociation(storage,task.id,vault,file));setMessage('关联已保存')}catch(e){setMessage(e.message)}}}>保存笔记关联</ActionButton></>}
 {uri&&<div className="workspace-actions"><a href={uri} className="text-link" rel="noreferrer">打开笔记</a><button className="text-link" onClick={async()=>{try{await navigator.clipboard.writeText(uri);setMessage('链接已复制')}catch{setMessage('无法复制，请选择下方链接文本')}}}>复制链接</button>{!locked&&<button className="text-link" onClick={()=>{if(confirm('移除本机关联？不会删除笔记。'))try{storage.removeItem(associationKey(task.id));setRow(null);setMessage('已移除')}catch(e){setMessage(e.message)}}}>移除关联</button>}</div>}{uri&&<input aria-label="Obsidian 关联链接" value={uri} readOnly/>}{message&&<p role="status">{message}</p>}</details>
}
const historyFieldNames={title:'任务名称',priority:'优先级',listId:'清单',sectionId:'分组',tags:'标签',date:'计划日期',time:'开始时间',anchor:'日期锚点',duration:'预计时长',deadline:'截止时间',planMinutes:'主时间段时长',planSegments:'补充时间段',deletedAt:'回收站状态',status:'任务状态',stage:'执行阶段',completedAt:'完成时间',repeat:'重复规则',seriesId:'重复系列',previousId:'上一实例',points:'任务积分'};
const historyKindNames={create:'创建任务',update:'修改任务',complete:'完成任务',reopen:'重新打开任务','undo-completion':'撤销完成','history-apply':'历史补偿','preview-apply':'提交预览','workspace-save':'工作空间保存','batch-capture':'批量录入',gap:'历史缺口'};
const fieldName=k=>historyFieldNames[k]||k;
function historyValue(k,v,data){
 if(!v?.present||v.value===null||v.value==='')return k==='deletedAt'?'未删除':'未设置';
 const x=v.value;
 if(k==='priority')return ['无优先级','低','中','高'][x]||String(x);
 if(k==='status'||k==='stage')return ({pending:'待办',completed:'已完成',skipped:'已跳过',todo:'待处理',doing:'进行中',done:'已完成'})[x]||String(x);
 if(k==='listId')return data.lists.find(l=>l.id===x)?.name||x;
 if(k==='sectionId')return data.lists.flatMap(l=>l.sections).find(s=>s.id===x)?.name||x;
 if(k==='tags')return x.map(id=>data.tags.find(t=>t.id===id)?.name||id).join('、')||'无标签';
 if(k==='deletedAt')return x?'回收站 · '+String(x).replace('T',' '):'未删除';
 if(k==='duration'||k==='planMinutes')return x+' 分钟';
 return typeof x==='string'?x:JSON.stringify(x);
}
function HistoryDiff({fields,data,onExclude}){
 return <div className="history-diff">{Object.entries(fields||{}).map(([k,v])=><div className="history-diff-row" key={k}><span className="muted small">{fieldName(k)}</span><div className="history-diff-values"><span>{historyValue(k,v.before,data)}</span><span aria-hidden="true" className="muted">→</span><span>{historyValue(k,v.after,data)}</span></div>{onExclude&&k!=='deletedAt'&&<button className="text-link" onClick={()=>onExclude(k)}>排除此关联字段</button>}</div>)}</div>
}
function OperationHistory({data,scope,storage,blocked,onRestore}){
 const [journal,setJournal]=useState(null),[request,setRequest]=useState(null),[preview,setPreview]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [filter,setFilter]=useState("all"),[detail,setDetail]=useState(null);
 const visible=journal?.entries.filter(e=>filter==="all"||filter==="cli"&&e.source==="cli"||filter==="local"&&e.source!=="cli"||filter==="group"&&e.groupId&&journal.entries.some(x=>x.version!==e.version&&x.groupId===e.groupId))||[];
 const refresh=async()=>{setPreview(null);setDetail(null);setError('');try{setJournal(await invoke('native_operation_history',{scope,detail:false}))}catch(e){setError(String(e))}};
 useEffect(()=>{setJournal(null);setRequest(null);refresh()},[scope]);
 const inspect=async version=>{setBusy(true);setError('');setDetail(null);try{
  const j=await invoke('native_operation_history',{scope,detail:true,version}),e=j.entries.find(x=>x.version===version);
  if(!e?.body)throw Error('此版本详情已超出读取预算或保留期');setDetail(e);
 }catch(e){setError(String(e?.message||e))}finally{setBusy(false)}};
 const prepare=async r=>{setBusy(true);setDetail(null);setError('');setPreview(null);setRequest(r);try{const {buildHistoryPreview,readConsistentHistory}=await import('../core/operation-history.js');const j=await readConsistentHistory(storage,data,()=>invoke('native_operation_history',{scope,detail:true}));const p=await buildHistoryPreview(data,r,j);setPreview({...p,expected:data,generatedAt:Date.now()})}catch(e){setError(String(e?.message||e))}finally{setBusy(false)}};
 const exclude=(id,field)=>{
  let selection=(request.selection||preview.rows.map(x=>({id:x.id}))).map(s=>({...s}));
  if(!field)selection=selection.filter(s=>s.id!==id);
  else{
   const groups=[['date','time','anchor','duration','deadline','planMinutes','planSegments'],['listId','sectionId','tags'],['status','stage','completedAt']];
   const group=groups.find(g=>g.includes(field))||[field];
   const row=preview.rows.find(r=>r.id===id),s=selection.find(s=>s.id===id);
   if(s){s.fields=(s.fields||Object.keys(row.fields)).filter(k=>!group.includes(k));if(!s.fields.length)selection=selection.filter(s=>s.id!==id)}
  }
  if(!selection.length){setPreview(null);setError('没有选择恢复的任务');return}
  prepare({...request,selection});
 };
 const apply=async()=>{if(!preview?.rows.length||blocked||busy)return;
  if(data!==preview.expected||Date.now()-preview.generatedAt>15*60000){setError('任务已变化或预览已过期，请重新预览');return}
  setBusy(true);try{
   const {buildHistoryPreview,readConsistentHistory}=await import('../core/operation-history.js'),{sameRecord}=await import('../core/record-equality.js');
   const j=await readConsistentHistory(storage,data,()=>invoke('native_operation_history',{scope,detail:true}));
   const next=await buildHistoryPreview(data,request,j,new Date());
   // Trash timestamp is regenerated; compare the exact original proposal by reusing its timestamp.
   const proposed=preview.rows.map(r=>({...r,fields:Object.fromEntries(Object.entries(r.fields).map(([k,v])=>[k,k==='deletedAt'&&v.after.value?{...v,after:{present:true,value:true}}:v]))}));
   const actual=next.rows.map(r=>({...r,fields:Object.fromEntries(Object.entries(r.fields).map(([k,v])=>[k,k==='deletedAt'&&v.after.value?{...v,after:{present:true,value:true}}:v]))}));
   if(j.head!==preview.head||!sameRecord(proposed,actual)||!sameRecord(preview.conflicts,next.conflicts)||!sameRecord(preview.pointsImpact,next.pointsImpact))throw Error('恢复范围已变化，请重新预览');
   onRestore?.(preview.expected,next.next);setPreview(null);setError('恢复已交给本地保存流程，尚未确认落盘。请刷新历史核对新版本。');
  }catch(e){setError(String(e?.message||e))}finally{setBusy(false)}
 };
 return <details className="local-knowledge operation-history"><summary>操作版本与恢复（本机）</summary><p className="muted small">保留最近30天、最多300次保存；受保护字段不恢复。历史时刻恢复仅撤回其后的 CLI 操作，不覆盖人工修改。</p><ActionButton compact disabled={busy} onClick={refresh}>刷新操作版本</ActionButton>{journal&&!journal.intact&&<p role="alert">历史连续性未知，恢复已禁用。</p>}
 <div className="workspace-actions"><Field label="版本来源"><select aria-label="版本来源" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部版本</option><option value="cli">CLI 操作</option><option value="local">非 CLI 保存</option><option value="group">多版本操作组</option></select></Field><span className="muted small">显示 {visible.length} / {journal?.entries.length||0} 个版本</span></div>
 <div className="professional-preview history-version-list">{visible.map(e=><div className="record-row history-version" key={e.version}><div><strong>V{e.version} · {e.source==='cli'?'CLI':'非 CLI 保存'}</strong><small>{new Date(e.at*1000).toLocaleString("zh-CN",{hour12:false})} · {historyKindNames[e.kind]||e.kind} · {e.count} 项{e.gap?' · 历史缺口':''}</small></div><div className="history-version-actions"><ActionButton compact disabled={busy} onClick={()=>inspect(e.version)}>版本详情</ActionButton><ActionButton compact disabled={busy||blocked||!journal.intact||e.gap} onClick={()=>prepare({op:'history-preview',version:e.version})}>恢复预览</ActionButton>{e.groupId&&journal.entries.some(x=>x.version!==e.version&&x.groupId===e.groupId)&&<ActionButton compact disabled={busy||blocked||!journal.intact||e.gap} onClick={()=>prepare({op:'history-preview',groupId:e.groupId})}>恢复操作组</ActionButton>}<ActionButton compact disabled={busy||blocked||!journal.intact||e.version>=journal.head} onClick={()=>prepare({op:'history-preview',afterVersion:e.version})}>撤回此后 AI</ActionButton></div></div>)}</div>
 {detail&&<div className="professional-preview history-version-detail"><div className="workspace-actions"><strong>V{detail.version} · 版本详情</strong><ActionButton compact onClick={()=>setDetail(null)}>关闭详情</ActionButton></div>{detail.groupId&&<p className="muted small">操作组 {detail.groupId}</p>}{detail.body.rows.map(r=><div className="record-row" key={r.id}><div><strong>{data.tasks.find(t=>t.id===r.id)?.title||r.id}</strong>{r.created&&<small>新建任务（仅保留指纹）</small>}{r.removed&&<small>永久删除（不可恢复）</small>}<HistoryDiff data={data} fields={r.lifecycle?.fields||r.fields}/>{r.protected?.length>0&&<small>受保护：{r.protected.map(fieldName).join('、')}</small>}{r.activityEvidence?.length>0&&<small>额外编辑证据：{r.activityEvidence.map(fieldName).join('、')}</small>}{r.lifecycle?<small>普通生命周期有独立校验证据</small>:r.activityUncertain&&<small>活动连续性需要核对</small>}</div></div>)}</div>}
 {preview&&<div className="professional-preview history-recovery-preview"><strong>恢复预览 · {preview.rows.length} 项可恢复，{preview.conflicts.length} 项限制</strong>{preview.pointsImpact&&<p className="small">积分余额：{preview.pointsImpact.before} → {preview.pointsImpact.after}（不修改兑换记录）</p>}{preview.rows.map(r=><div key={r.id} className="record-row history-version"><div><strong>{r.title}</strong><HistoryDiff data={data} fields={r.fields} onExclude={busy?null:k=>exclude(r.id,k)}/></div><ActionButton compact disabled={busy} onClick={()=>exclude(r.id)}>排除此任务</ActionButton></div>)}{preview.conflicts.map((c,i)=><p className="muted small" key={i}>V{c.version} · {c.reason} {c.fields?.map(fieldName).join('、')}{c.comparison?.map(v=><span key={v.field} style={{display:'block'}}>{fieldName(v.field)}：原值 {historyValue(v.field,v.before,data)} / 历史提交 {historyValue(v.field,v.after,data)} / 当前 {historyValue(v.field,v.current,data)}</span>)}</p>)}<ActionButton disabled={blocked||busy||!preview.rows.length} onClick={apply}>确认恢复所示变更</ActionButton><ActionButton onClick={()=>setPreview(null)}>取消预览</ActionButton></div>}{error&&<p role="status">{error}</p>}</details>;
}
export function HistorySearch({data,archived,onClose,onOpen,scope,historyStorage,historyBlocked,onHistoryRestore}){
 const [query,setQuery]=useState(''),[kind,setKind]=useState('all'),[limit,setLimit]=useState(50);
 const rows=useMemo(()=>historicalSearch(data,archived,query,kind),[data,archived,query,kind]);
 return <Modal open title="历史归档检索" onClose={onClose} description="搜索已完成、已跳过和归档清单中的任务，并查看本机操作版本。">{desktopNative&&<OperationHistory key={scope} data={data} scope={scope} storage={historyStorage} blocked={historyBlocked} onRestore={onHistoryRestore}/>}<input aria-label="历史搜索" value={query} onChange={e=>{setQuery(e.target.value);setLimit(50)}} placeholder="搜索标题、备注、清单…"/><SmartSelect aria-label="历史范围" value={kind} onValueChange={v=>{setKind(v);setLimit(50)}}>{[['all','全部历史'],['completed','已完成'],['skipped','已跳过'],['archived','归档清单']].map(([v,n])=><SelectOption key={v} value={v}>{n}</SelectOption>)}</SmartSelect><p className="muted small">{rows.length} 项结果</p><div className="professional-preview">{rows.slice(0,limit).map(t=><div className="record-row" key={t.id}><button className="text-link" onClick={()=>onOpen(t)}>{t.title}</button><small>{data.lists.find(l=>l.id===t.listId)?.name} · {t.completedAt?.slice(0,10)||t.date||'未安排'}</small></div>)}</div>{limit<rows.length&&<ActionButton onClick={()=>setLimit(v=>v+50)}>加载更多</ActionButton>}</Modal>
}

export function ShareTask({task}){
 const [message,setMessage]=useState('');
 const text=task.title+(task.date?' · '+task.date+(task.time?' '+task.time:''):'');
 return <div className="workspace-actions"><button type="button" className="secondary compact" onClick={async()=>{try{if(androidNative){await invoke('plugin:todo-mobile|share_summary',{text});setMessage('已请求打开系统分享面板');return}if(typeof navigator.share!=='function'){setMessage('此环境不支持系统分享，可使用复制任务摘要。');return}await navigator.share({title:'TODO',text});setMessage('系统分享面板已返回（不保证接收方已收到）')}catch(e){if(e.name!=='AbortError')setMessage('系统分享不可用，可复制摘要')}}}>分享任务摘要</button><button type="button" className="text-link" onClick={async()=>{try{await navigator.clipboard.writeText(text);setMessage('摘要已复制')}catch{setMessage('无法复制，请选择任务标题')}}}>复制任务摘要</button>{message&&<small role="status">{message}</small>}</div>
}
