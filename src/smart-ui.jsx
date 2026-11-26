import {SmartSelect,SelectOption} from './components/SmartSelect.jsx';
import React,{useState,useMemo} from 'react';
import {Modal,Field} from './ui.jsx';
import {emptyFilter,normalizeFilter,smartMatches,isDeadlineFilter} from './core/smart-lists.js';
import {id} from './core/domain.js';
export function SmartDialog({filter,data,today,onClose,onSave}){
 const [draft,setDraft]=useState(()=>({...emptyFilter,...filter}));
 const set=(k,v)=>setDraft(f=>({...f,[k]:v}));
 const count=useMemo(()=>data.tasks.filter(t=>smartMatches(t,normalizeFilter(draft),today)).length,[data.tasks,draft,today]);
 const select=(k,label,options)=><Field label={label}><SmartSelect aria-label={label} value={draft[k]} onValueChange={value=>set(k,value)}>{options.map(([v,n])=><SelectOption key={v} value={v}>{n}</SelectOption>)}</SmartSelect></Field>;
 return <Modal open onClose={onClose} title={filter?.id?'编辑智能清单':'新建智能清单'}><form className="smart-form" onSubmit={e=>{e.preventDefault();if(draft.name.trim())onSave(normalizeFilter({...draft,id:draft.id||id()}))}}>
 <Field label="清单名称"><input aria-label="智能清单名称" autoFocus required maxLength={80} value={draft.name} onChange={e=>set('name',e.target.value)}/></Field>
 <Field label="关键词"><input aria-label="筛选关键词" maxLength={200} value={draft.text} onChange={e=>set('text',e.target.value)} placeholder="标题或备注"/></Field>
 {select('mode','匹配方式',[['all','同时满足全部条件（AND）'],['any','满足任一条件（OR）']])}
 {select('status','任务状态',[['pending','待处理'],['completed','已完成'],['all','待处理和已完成']])}
 {select('date','日期条件',[['any','不限'],['today','今天'],['overdue','已过期'],['next7','未来七天（含今天）'],['none','未安排'],['due-today','截止今天'],['due-overdue','截止已过期'],['due-next7','七天内截止'],['due-none','无截止日期']])}
 {select('priority','筛选优先级',[['any','不限'],['3','高'],['2','中'],['1','低'],['0','无']])}
 {select('listId','来源清单',[['','全部'],...data.lists.map(l=>[l.id,l.name])])}
 {select('tagId','标签条件',[['','全部'],...data.tags.map(t=>[t.id,t.name])])}
 {select('repeat','重复条件',[['any','不限'],['yes','重复任务'],['no','非重复任务']])}
 {select('timed','时间安排',[['any','不限'],['yes','已安排时间'],['no','未安排时间']])}
 <p className="smart-preview" role="status">匹配 {count} 项任务 · {draft.mode==='any'?'任一启用条件匹配':'全部启用条件匹配'} · 状态始终生效 · {isDeadlineFilter(draft)?'截止筛选仅保存在本机（不向旧客户端同步）':'保存至工作空间'}</p><div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!draft.name.trim()}>保存智能清单</button></div></form></Modal>
}
