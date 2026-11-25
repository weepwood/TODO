import React,{useState} from 'react';
import {Modal,Field} from '../ui.jsx';
import {SmartSelect,SelectOption} from './SmartSelect.jsx';
import {CheckInput} from '../design-system/Controls.jsx';
import {newRule,validRule,previewRules} from '../core/workflow-rules.js';
export function WorkflowRules({state,data,today,localOnly,onSave,onRun,onClose,blocked,error}){
 const [draft,setDraft]=useState(state.rules),[auto,setAuto]=useState(state.auto),[message,setMessage]=useState('');
 const rules=draft.filter(validRule),rows=previewRules(data,rules,today),valid=rules.length===draft.length;
 const change=(id,patch)=>setDraft(old=>old.map(r=>r.id===id?{...r,...patch}:r));
 const move=(index,offset)=>setDraft(old=>{const target=index+offset;if(target<0||target>=old.length)return old;const next=[...old];[next[index],next[target]]=[next[target],next[index]];return next});
 const options=(label,value,values,fn)=><SmartSelect aria-label={label} value={value} onValueChange={fn}>{values.map(([v,n])=><SelectOption key={v} value={v}>{n}</SelectOption>)}</SmartSelect>;
 return <Modal open onClose={onClose} title="任务工作流自动化" className="workflow-dialog" description="条件匹配普通待办；按列表顺序处理同一字段，首个有效变更优先。保留独立提醒、积分及历史，不处理重复系列。">
 {error&&<p role="alert">{error}</p>}
 <label className="compact-checkbox"><CheckInput checked={auto&&localOnly} disabled={!localOnly||!!error} onChange={e=>setAuto(e.target.checked)}/> 每天首次打开本地访客工作区时自动执行</label>
 <p className="muted small">默认关闭；开启并保存时可立即运行，之后在本机访客工作区打开或进入前台时每天尝试一次。云账号仅支持手动预览执行。最近自动尝试：{state.lastRun||'无'}</p>
 {draft.map((r,i)=><section key={r.id} className="review-section workflow-rule"><div className="record-row"><label className="compact-checkbox"><CheckInput checked={r.enabled} onChange={e=>change(r.id,{enabled:e.target.checked})}/>规则 {i+1}</label><div className="workflow-rule-actions"><button className="text-link" disabled={i===0} onClick={()=>move(i,-1)}>上移</button><button className="text-link" disabled={i===draft.length-1} onClick={()=>move(i,1)}>下移</button><button className="text-link" onClick={()=>setDraft(old=>old.filter(x=>x.id!==r.id))}>删除</button></div></div><Field label="规则名称"><input aria-label={'规则名称 '+(i+1)} maxLength={80} value={r.name} onChange={e=>change(r.id,{name:e.target.value})}/></Field><Field label="清单">{options('规则清单 '+(i+1),r.list,[['all','所有清单'],...data.lists.map(l=>[l.id,l.name]),...(!data.lists.some(l=>l.id===r.list)&&r.list!=='all'?[[r.list,'已移除清单']]:[])],list=>change(r.id,{list}))}</Field><Field label="当任务">{options('触发条件 '+(i+1),r.condition,[['overdue','已经过期'],['unscheduled','没有日期'],['today','计划今天']],condition=>change(r.id,{condition}))}</Field><Field label="执行">{options('规则操作 '+(i+1),r.action,[['today','安排今天'],['tomorrow','安排明天'],['high','设置高优先级']],action=>change(r.id,{action}))}</Field></section>)}
 <button className="secondary" disabled={draft.length>=20||!!error} onClick={()=>setDraft(old=>[...old,newRule()])}>添加规则</button>
 <section className="review-section"><h3>执行预览 · {rows.length} 项</h3>{rows.slice(0,50).map(r=><div className="record-row" key={r.id}><div><strong>{r.title}</strong><small>{r.rules.join(' · ')}</small></div><small>{r.patch.date?(r.date||'未安排')+' → '+r.patch.date:''}{r.patch.priority?' · 优先级 → 高':''}</small></div>)}{rows.length>50&&<p>显示前50项，执行包含全部。</p>}</section>
 {message&&<p role="status">{message}</p>}<div className="dialog-actions"><button className="secondary" disabled={!valid||!!error} onClick={()=>setMessage(onSave(draft,auto&&localOnly)?'规则已保存':'保存失败')}>保存规则</button><button className="primary" disabled={!valid||blocked||!!error||!rows.length} onClick={()=>{if(confirm('执行预览中的 '+rows.length+' 项普通任务变更？'))onRun(rows,rules)}}>执行规则</button></div>
 </Modal>
}
