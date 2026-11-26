import React,{useEffect,useRef,useState} from 'react';
import {SettingsGroup} from './SettingsLayout.jsx';
import {ActionButton,Field} from '../ui.jsx';
import {ownerExternalRequest} from '../services/external-api.js';

export function ExternalCapturePanel({session,data,blocked,onSaved}){
 const [expanded,setExpanded]=useState(false),[tokens,setTokens]=useState([]),[requests,setRequests]=useState([]),[label,setLabel]=useState(''),[automatic,setAutomatic]=useState(false),[secret,setSecret]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const alive=useRef(true),running=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const call=(path,options)=>ownerExternalRequest(session,path,options);
 const refresh=async()=>{const [t,r]=await Promise.all([call('tokens'),call('requests')]);if(alive.current){setTokens(t);setRequests(r)}};
 const run=async fn=>{if(running.current)return;running.current=true;setBusy(true);setMessage('');try{await fn()}catch(e){if(alive.current)setMessage(e.message)}finally{running.current=false;if(alive.current)setBusy(false)}};
 return <SettingsGroup title="外部任务接入" description="通过 API 或 MCP 接收任务；默认先确认。自动创建仅允许新增任务，不授予任务读取或删除权限。">
 <ActionButton onClick={()=>{setExpanded(!expanded);setSecret('');if(!expanded)run(refresh)}}>{expanded?'收起接入管理':'管理外部接入'}</ActionButton>
 {expanded&&<div className="external-capture-panel">
 <div className="record-row"><strong>访问令牌</strong><ActionButton disabled={busy} onClick={()=>run(refresh)}>刷新</ActionButton></div>
 <form onSubmit={e=>{e.preventDefault();run(async()=>{const t=await call('tokens',{method:'POST',body:{label:label.trim(),automatic}});if(!alive.current)return;setSecret(t.token);setLabel('');setAutomatic(false);await refresh()})}}>
 <Field label="工具名称"><input aria-label="外部工具名称" value={label} maxLength={80} required onChange={e=>setLabel(e.target.value)} placeholder="例如 Codex"/></Field>
 <label><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)}/> 允许该工具直接自动创建任务</label>
 <div className="dialog-actions"><ActionButton variant="primary" type="submit" disabled={busy||!label.trim()}>生成令牌</ActionButton></div>
 </form>
 {secret&&<div className="external-token"><p role="status">令牌只显示一次，请保存到外部工具的安全凭据配置。</p><input aria-label="新访问令牌" readOnly value={secret} onFocus={e=>e.target.select()}/><ActionButton onClick={()=>run(async()=>{await navigator.clipboard.writeText(secret);setMessage('已复制令牌')})}>复制</ActionButton><ActionButton onClick={()=>setSecret('')}>隐藏</ActionButton></div>}
 {tokens.map(t=><div className="record-row" key={t.id}><span>{t.label}<small>{t.automatic?'自动创建':'待确认'} · {t.revoked_at?'已撤销':new Date(t.expires_at)<=new Date()?'已过期':'有效至 '+t.expires_at.slice(0,10)}</small></span>{!t.revoked_at&&<ActionButton disabled={busy} onClick={()=>run(async()=>{await call('tokens/'+t.id+'/revoke',{method:'POST'});setSecret('');await refresh()})}>撤销</ActionButton>}</div>)}
 <h4>待确认录入</h4>{!requests.length&&<p className="muted small">暂无待确认任务</p>}
 {requests.map(r=><section className="settings-group external-request" key={r.id}><strong>{r.source} · {r.tasks.length} 项任务</strong><div className="professional-preview">{r.tasks.map((t,i)=><div className="record-row" key={i}><span><span>{t.title}</span><small>{data.lists.find(l=>l.id===(t.listId||'inbox'))?.name||'目标清单不存在'} · {t.date||'未指定日期'} {t.time||''}{t.deadline?' · 截止 '+t.deadline:''}{t.reminderAt?' · 提醒 '+t.reminderAt:''} · {t.duration??30} 分钟 · 优先级 {t.priority??0}</small>{t.notes&&<small className="external-note">{t.notes}</small>}</span></div>)}</div><div className="dialog-actions"><ActionButton disabled={busy} onClick={()=>run(async()=>{await call('requests/'+r.id+'/reject',{method:'POST'});await refresh()})}>拒绝</ActionButton><ActionButton variant="primary" disabled={busy||blocked} onClick={()=>run(async()=>{const result=await call('requests/'+r.id+'/approve',{method:'POST'});if(alive.current)setMessage(result.status==='saved'?'已保存到云端，等待本机同步':'请求未保存：'+result.status);await refresh();if(result.status==='saved'&&alive.current)onSaved()})}>确认创建</ActionButton></div></section>)}
 {message&&<p role="status">{message}</p>}
 </div>}
 </SettingsGroup>;
}
