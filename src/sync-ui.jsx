import {RadioInput} from "./design-system/Controls.jsx";
import React from 'react';
import {compareWorkspace} from './services/sync-diagnostics.js';
const labels={push:'上传工作空间',delta:'差量上传','delta-pull':'差量下载',pull:'下载云端版本',insert:'初始化云端',merge:'安全合并',conflict:'检测到冲突',offline:'离线',retry:'版本变化等待重试',error:'同步失败'};
export function SyncDiagnostics({entries,clear}){return <details className="sync-diagnostics"><summary>同步日志（本机）</summary><p className="muted small">最多 60 条关键同步事件，不记录任务内容或凭据。</p>{entries.length?entries.map((e,i)=><div className="record-row" key={e.at+i}><span>{labels[e.kind]||e.kind}{e.revision?' · v'+e.revision:''}</span><small>{new Date(e.at).toLocaleTimeString()}</small></div>):<p className="muted small">暂无同步事件</p>}<button className="text-link" onClick={clear}>清空本机日志</button></details>}
export function ConflictPreview({local,remote}){const d=compareWorkspace(local,remote);return <details className="sync-diagnostics"><summary>比较本地与云端版本</summary><p className="muted small">本地独有 {d.localOnly} · 云端独有 {d.remoteOnly} · 内容不同 {d.changed}</p>{d.otherFields.length>0&&<p className="muted small">其他不同字段：{d.otherFields.join('、')}</p>}<div className="conflict-preview">{d.details.map((x,i)=><div key={i}><span>{x.kind==='local'?'仅本地':x.kind==='remote'?'仅云端':'内容不同'}</span><div>{x.local||'—'}</div><div>{x.remote||'—'}</div>{x.fields?.length>0&&<small>{x.fields.join('、')}</small>}</div>)}</div>{d.localOnly+d.remoteOnly+d.changed>d.details.length&&<p className="muted small">仅显示前 12 项；完整数据可通过冲突备份导出。</p>}</details>}

import {useState,useMemo} from 'react';
import {manualMergePlan} from './services/sync-merge.js';
const fieldLabels={title:'标题',notes:'备注',priority:'优先级',points:'积分'};
export function FieldMerge({conflict,local,onApply}){
 const plan=useMemo(()=>manualMergePlan(conflict.base,local,conflict.remote),[conflict.base,local,conflict.remote]);
 const [choices,setChoices]=useState({});
 if(!plan)return null;
 const ready=plan.every(c=>['local','remote'].includes(choices[c.key]));
 return <details className="sync-diagnostics"><summary>按字段合并普通任务</summary><p className="muted small">保留双方独立修改，仅选择真正冲突的字段。应用前再次核对版本，双方原始快照保留本机备份。</p>{plan.map(c=><fieldset className="field-conflict" key={c.key}><legend>{c.title} · {fieldLabels[c.field]||c.field}</legend>{[['local','本地',c.local],['remote','云端',c.remote]].map(([side,label,value])=><label key={side}><RadioInput name={c.key} checked={choices[c.key]===side} onChange={()=>setChoices(x=>({...x,[c.key]:side}))}/><span><strong>{label}</strong><span>{String(value??'（空）')}</span></span></label>)}</fieldset>)}<button className="primary" disabled={!ready} onClick={()=>onApply(choices)}>确认字段合并</button></details>
}
