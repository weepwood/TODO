import React,{useState} from 'react';
import {PropertyPopover} from '../../components/EditableProperty.jsx';
import {ReminderFields,RecurrenceFields} from '../../task-fields.jsx';
import {scheduleSnapshot,scheduleChanges,reminderBefore} from '../../core/task-schedule.js';

export function ScheduleProperty({kind,task,patch,seriesLocked,value}){
 const label=kind==='reminder'?'提醒':'重复';
 return <PropertyPopover label={label} value={value} className="schedule-property-popover">{close=><ScheduleDraft kind={kind} task={task} patch={patch} seriesLocked={seriesLocked} close={close}/>}</PropertyPopover>
}
function ScheduleDraft({kind,task,patch,seriesLocked,close}){
 const [original]=useState(task),[draft,setDraft]=useState(()=>scheduleSnapshot(task)),[error,setError]=useState(''),[wholeSeries,setWholeSeries]=useState(false);
 const update=fields=>{setDraft(d=>({...d,...fields}));setError('')};
 const staged={...original,...draft};
 function save(){const result=scheduleChanges(original,task,draft,{locked:seriesLocked});if(result.error){setError(result.error);return}if(Object.keys(result.fields).length)patch(result.fields,{expected:scheduleSnapshot(original),series:kind==='repeat'&&wholeSeries});close()}
 return <><h4>{kind==='reminder'?'提醒设置':'重复规则'}</h4>
 {kind==='reminder'?<><div className="schedule-reminder-presets">{[0,1,5,15,60].map(m=><button key={m} type="button" className="secondary compact" disabled={!reminderBefore(draft.date,draft.time,m)} onClick={()=>update({reminderAt:reminderBefore(draft.date,draft.time,m)})}>{m?'提前 '+m+' 分钟':'准时'}</button>)}</div><ReminderFields task={staged} patch={update}/><p className="muted small">独立提醒不会随计划日期自动移动。</p></>:seriesLocked?<p className="muted small">系列暂停或存在冲突，请先在系列管理中处理。</p>:<><RecurrenceFields task={staged} patch={update}/>{(original.repeat!=='none'||original.seriesId)&&<label className="compact-checkbox"><input type="checkbox" checked={wholeSeries} onChange={e=>setWholeSeries(e.target.checked)}/> 修改本系列待办实例及未来规则</label>}<p className="muted small">不改变历史记录；暂停或冲突系列不可修改规则。</p></>}
 {error&&<p className="sync-error" role="alert">{error}</p>}
 <div className="property-popover-actions"><button type="button" className="secondary" onClick={close}>取消</button><button type="button" className="primary" onClick={save}>确定</button></div></>
}
