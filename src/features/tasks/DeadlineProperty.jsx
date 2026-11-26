import React,{useState} from 'react';
import {PropertyPopover} from '../../components/EditableProperty.jsx';
import {DatePicker} from '../../components/DatePicker.jsx';
import {TimeControl} from '../../components/TimeControl.jsx';
import {validDeadline,deadlineStatus} from '../../core/deadline.js';
export function DeadlineProperty({task,patch,locked}){
 const status=deadlineStatus(task),label=task.deadline?.replace('T',' ')||'未设置';
 const value=<span className={status==='overdue'?'task-warning':undefined}>{label}{status==='overdue'?' · 已超期':status==='late-completed'?' · 逾期完成':status==='on-time'?' · 按时完成':''}</span>;
 if(locked)return value;
 return <PropertyPopover label="截止日期" value={value}>{close=><DeadlineEditor task={task} patch={patch} close={close}/>}</PropertyPopover>;
}
function DeadlineEditor({task,patch,close}){
 const [date,setDate]=useState(task.deadline?.slice(0,10)||''),[time,setTime]=useState(task.deadline?.slice(11)||'');
 const deadline=date?date+(time?'T'+time:''):'';
 return <><h4>截止期限</h4><p className="muted small">独立于计划和提醒。延期不改变本期限；重复实例按计划日相对偏移继承。</p><DatePicker label="截止日期" inline selectionOnly value={date} onChange={setDate}/><TimeControl label="截止时间" value={time} onChange={setTime}/><div className="dialog-actions"><button className="secondary" onClick={()=>{patch({deadline:''});close()}}>清除截止</button><button className="primary" disabled={!date||!validDeadline(deadline)} onClick={()=>{patch({deadline});close()}}>保存截止</button></div></>;
}
