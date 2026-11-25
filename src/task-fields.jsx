import {Segmented} from "./design-system/Controls.jsx";
import {CheckInput} from "./design-system/Controls.jsx";
import {DatePicker} from './components/DatePicker.jsx';
export {DatePicker,DateControl} from './components/DatePicker.jsx';
import {DateTimeControl} from './components/DateTimeControl.jsx';
import {TimeControl} from './components/TimeControl.jsx';
import {SearchSelect} from './components/SearchSelect.jsx';
import {SmartSelect,SelectOption} from './components/SmartSelect.jsx';
import React,{useState} from 'react';
import {Plus,X} from 'lucide-react';
import {dayKey,id} from './core/domain.js';
import {blockers,canLink,descendants} from './core/advanced.js';
import {Field,NumberField} from './ui.jsx';
export function RecurrenceFields({task,patch,seriesEdit}){
 const rules=['daily','weekly','monthly','weekdays','workdays','completion'];
 const [series,setSeries]=useState(false);
 function rule(fields){(series&&seriesEdit?seriesEdit:patch)(fields)}
 if(task.seriesHold)return <p className="muted small">系列已暂停。请在活动与系列历史中恢复或结束后编辑重复规则。</p>;
 return <><Field label="重复规则"><SmartSelect aria-label="重复规则" value={task.repeat} onValueChange={value=>{const date=task.date||dayKey();if(!task.date)patch({date,anchor:Number(date.slice(-2))});rule({repeat:value,seriesStart:task.seriesStart||date,weekdays:task.weekdays?.length?task.weekdays:[new Date(date+'T12:00:00').getDay()]})}}><SelectOption value="none">不重复</SelectOption>{rules.map((r,i)=><SelectOption value={r} key={r}>{['每天','每周','每月','指定星期','工作日','完成后按天'][i]}</SelectOption>)}</SmartSelect></Field>
 {task.repeat!=='none'&&<div className="rule-fields">{seriesEdit&&<label className="compact-checkbox"><CheckInput checked={series} onChange={e=>setSeries(e.target.checked)}/> 修改本系列待办实例及未来规则</label>}{task.repeat!=='workdays'&&<Field label="间隔"><NumberField label="周期间隔" min={1} max={365} value={task.interval} onCommit={interval=>rule({interval})}/></Field>}{task.repeat==='weekdays'&&<Segmented className="weekdays" label="重复星期" multiple value={task.weekdays} options={[1,2,3,4,5,6,0].map((value,i)=>({value,label:'一二三四五六日'[i]}))} onValueChange={weekdays=>{if(weekdays.length)rule({weekdays})}}/>}{task.repeat!=='completion'&&<><Field label="过期处理"><SmartSelect aria-label="错过任务处理" value={task.miss} onValueChange={value=>rule({miss:value})}><SelectOption value="keep">保留过期</SelectOption><SelectOption value="skip">跳过过期</SelectOption></SmartSelect></Field>{task.miss==='skip'&&<Field label="周期重置"><TimeControl label="周期重置" required value={task.reset} onChange={reset=>rule({reset})}/></Field>}</>}
 <Field label="截止日期" help="留空表示无截止日期"><DatePicker label="重复截止日期" value={task.repeatUntil||''} onChange={v=>rule({repeatUntil:v})}/></Field><Field label="最多次数"><NumberField label="最多重复次数（0无限）" min={0} max={100000} value={task.repeatCount||0} onCommit={repeatCount=>rule({repeatCount})}/></Field><p className="muted small">0 表示不限次数 · 当前第 {task.occurrenceIndex||1} 次</p></div>}</>
}
export function ReminderFields({task,patch}){const extra=task.extraReminders||[];return <div className="reminder-fields"><Field label="独立提醒"><DateTimeControl label="独立提醒" value={task.reminderAt} defaultDate={task.date} onChange={reminderAt=>patch({reminderAt})}/></Field>{extra.map((r,i)=><div className="extra-reminder" key={r.id}><DateTimeControl label={'提醒 '+(i+2)} value={r.at} required defaultDate={task.date} onChange={at=>patch({extraReminders:extra.map(x=>x.id===r.id?{...x,at,sentAt:null}:x)})}/><button type="button" className="icon-button" aria-label="移除提醒" onClick={()=>patch({extraReminders:extra.filter(x=>x.id!==r.id)})}><X size={14}/></button></div>)}<button type="button" className="text-link" disabled={extra.length>=20} onClick={()=>patch({extraReminders:[...extra,{id:id(),at:(task.date||dayKey())+'T09:00',sentAt:null}]})}><Plus size={13}/> 添加提醒</button></div>}
// Child tasks and task relationships are independent inspector sections.
export function ChildTasks({task,children,select,addChild,locked}){
 const [child,setChild]=useState('');
 return <div className="inspector-child-tasks">
 {children.map(t=><button type="button" key={t.id} className="relation-row inspector-child-row" onClick={()=>select(t.id)}><span>{t.parentId===task.id?'↳':'　↳'} {t.title}</span><small>{t.status==='completed'?'已完成':t.status==='skipped'?'已跳过':'待办'}</small></button>)}
 {!children.length&&locked&&<p className="muted small inspector-empty">暂无子任务</p>}
 {!locked&&<form className="check-add" onSubmit={e=>{e.preventDefault();if(child.trim()){addChild(child.trim());setChild('')}}}><Plus size={14}/><input aria-label="新建子任务" placeholder="新建子任务" value={child} onChange={e=>setChild(e.target.value)}/></form>}
 </div>
}
export function Relations({task,data,patch,select,locked}){
 const [dep,setDep]=useState('');
 const candidates=locked?[]:data.tasks.filter(t=>t.id!==task.id&&!t.deletedAt&&t.status==='pending');
 const parent=data.tasks.find(t=>t.id===task.parentId);
 return <div className="inspector-relations">
 <Field label="父任务">{locked?<span className="inspector-relation-value">{task.parentId?<button type="button" className="text-link" onClick={()=>select(task.parentId)}>{parent?.title||'已删除任务'}</button>:'无'}</span>:<SearchSelect aria-label="父任务" value={task.parentId||''} onValueChange={value=>{const p=value||null;if(canLink(data.tasks,task.id,p,'parentId'))patch({parentId:p})}}><SelectOption value="">无</SelectOption>{task.parentId&&!candidates.some(t=>t.id===task.parentId&&canLink(data.tasks,task.id,t.id,'parentId'))&&<SelectOption value={task.parentId}>{parent?.title||'已删除任务'}</SelectOption>}{candidates.filter(t=>canLink(data.tasks,task.id,t.id,'parentId')).map(t=><SelectOption key={t.id} value={t.id}>{t.title}</SelectOption>)}</SearchSelect>}</Field>
 {(task.dependsOn||[]).map(tid=>{const t=data.tasks.find(x=>x.id===tid);return <div className="record-row inspector-dependency-row" key={tid}><button type="button" className="text-link" onClick={()=>select(tid)}>{t?.title||'已删除依赖'}</button><small>{t?.status==='completed'?'已完成':'未完成'}</small>{!locked&&<button type="button" className="icon-button" aria-label="移除依赖" onClick={()=>patch({dependsOn:task.dependsOn.filter(x=>x!==tid)})}><X size={13}/></button>}</div>})}
 {!locked&&<Field label="添加前置任务"><SearchSelect aria-label="前置任务" value={dep} onValueChange={value=>{const d=value;if(d&&canLink(data.tasks,task.id,d))patch({dependsOn:[...new Set([...(task.dependsOn||[]),d])]});setDep('')}}><SelectOption value="">选择任务</SelectOption>{candidates.filter(t=>!(task.dependsOn||[]).includes(t.id)&&canLink(data.tasks,task.id,t.id)).map(t=><SelectOption key={t.id} value={t.id}>{t.title}</SelectOption>)}</SearchSelect></Field>}
 {locked&&!(task.dependsOn||[]).length&&<p className="muted small inspector-empty">暂无前置任务</p>}
 {blockers(data.tasks,task).length>0&&<p className="sync-error">前置任务未完成，暂不能完成此任务。</p>}</div>
}
