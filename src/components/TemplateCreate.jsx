import React,{useState} from 'react';
import {Modal,Field} from '../ui.jsx';
import {DatePicker} from './DatePicker.jsx';
import {SmartSelect,SelectOption} from './SmartSelect.jsx';
import {templateTask} from '../core/task-workflow.js';
export function TemplateCreate({template,data,today,defaultDate,onClose,onCreate,blocked}){
 const [title,setTitle]=useState(template.task.title),[listId,setListId]=useState(data.lists.some(l=>l.id===template.task.listId)?template.task.listId:'inbox'),[date,setDate]=useState(defaultDate);
 const old=template.task;
 return <Modal open onClose={onClose} title="从模板创建任务" className="template-create-dialog" description="复制内容、优先级、预计时长、标签及未勾选检查项；不复制历史、附件、提醒、依赖和重复规则。">
 <form onSubmit={e=>{e.preventDefault();if(blocked)return;const t=templateTask(template,data,{title,listId,date});if(t)onCreate(t)}}>
 <Field label="任务标题"><input aria-label="模板任务标题" value={title} onChange={e=>setTitle(e.target.value)} required/></Field>
 <Field label="目标清单"><SmartSelect aria-label="模板目标清单" value={listId} onValueChange={setListId}>{data.lists.map(l=><SelectOption key={l.id} value={l.id}>{l.name}</SelectOption>)}</SmartSelect></Field>
 <Field label="计划日期"><DatePicker label="模板计划日期" value={date} onChange={setDate}/></Field>
 <div className="dialog-actions"><button type="button" className="secondary compact" onClick={()=>setDate(today)}>今天</button><button type="button" className="secondary compact" onClick={()=>setDate('')}>不安排</button></div>
 <p className="muted small">预计 {old.duration||30} 分钟 · {old.checklist.length} 项检查项{date&&old.time?' · '+old.time:''}</p>
 <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" type="submit" disabled={blocked||!title.trim()}>创建任务</button></div>
 </form></Modal>
}
