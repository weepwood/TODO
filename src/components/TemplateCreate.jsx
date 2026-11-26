import React,{useState} from 'react';
import {Modal,Field,NumberField} from '../ui.jsx';
import {TimeControl} from './TimeControl.jsx';
import {DatePicker} from './DatePicker.jsx';
import {SmartSelect,SelectOption} from './SmartSelect.jsx';
import {templateTask} from '../core/task-workflow.js';
export function TemplateCreate({template,data,today,defaultDate,onClose,onCreate,blocked}){
 const [title,setTitle]=useState(template.task.title),[listId,setListId]=useState(data.lists.some(l=>l.id===template.task.listId)?template.task.listId:'inbox'),[date,setDate]=useState(defaultDate);
 const old=template.task;const [duration,setDuration]=useState(old.duration||30),[priority,setPriority]=useState(old.priority||0),[time,setTime]=useState(old.time||''),[project,setProject]=useState(''),[error,setError]=useState('');
 const hasProject=[title,old.notes,...old.checklist.map(c=>c.text)].some(t=>t.includes('{{项目}}'));
 return <Modal open onClose={onClose} title="从模板创建任务" className="template-create-dialog" description="复制内容、优先级、预计时长、标签及未勾选检查项；不复制历史、附件、提醒、依赖和重复规则。">
 <form onSubmit={e=>{e.preventDefault();if(blocked)return;const t=templateTask(template,data,{title,listId,date,duration,priority,project,time:date?time:""});if(t)onCreate(t);else setError("参数未填写或内容超出限制")}}>
 <Field label="任务标题"><input aria-label="模板任务标题" value={title} onChange={e=>setTitle(e.target.value)} required/></Field>
 {hasProject&&<Field label="项目变量"><input aria-label="模板项目变量" maxLength={100} value={project} onChange={e=>setProject(e.target.value)}/></Field>}<p className="muted small">支持 {"{{项目}}、{{日期}}、{{清单}}"} 变量（仅替换已知标记）。</p><Field label="目标清单"><SmartSelect aria-label="模板目标清单" value={listId} onValueChange={setListId}>{data.lists.map(l=><SelectOption key={l.id} value={l.id}>{l.name}</SelectOption>)}</SmartSelect></Field>
 <Field label="计划日期"><DatePicker label="模板计划日期" value={date} onChange={setDate}/></Field>
 <div className="dialog-actions"><button type="button" className="secondary compact" onClick={()=>setDate(today)}>今天</button><button type="button" className="secondary compact" onClick={()=>setDate('')}>不安排</button></div>
 <Field label="预计时长"><NumberField label="模板预计时长" min={1} max={1440} unit="分钟" value={duration} onCommit={setDuration}/></Field><Field label="优先级"><SmartSelect aria-label="模板优先级" value={String(priority)} onValueChange={v=>setPriority(+v)}>{['无','低','中','高'].map((n,i)=><SelectOption key={i} value={String(i)}>{n}</SelectOption>)}</SmartSelect></Field>{date&&<Field label="计划时间"><TimeControl label="模板计划时间" value={time} onChange={setTime}/></Field>}
 <p className="muted small">预计 {duration} 分钟 · {old.checklist.length} 项检查项{date&&time?' · '+time:''}</p>
 {error&&<p role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" type="submit" disabled={blocked||!title.trim()}>创建任务</button></div>
 </form></Modal>
}
