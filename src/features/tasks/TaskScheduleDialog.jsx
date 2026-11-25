import React,{useState} from 'react';
import {Clock,Bell,Repeat} from 'lucide-react';
import {Modal,Field} from '../../ui.jsx';
import {DatePicker} from '../../components/DatePicker.jsx';
import {TimeControl} from '../../components/TimeControl.jsx';
import {ScheduleOption,ScheduleSubpanel,ScheduleFlyout,useSideSchedule} from '../../components/ScheduleOption.jsx';
import {ReminderFields,RecurrenceFields} from '../../task-fields.jsx';
import {scheduleSnapshot,scheduleChanges,reminderBefore} from '../../core/task-schedule.js';
const repeatNames={none:'不重复',daily:'每天',weekly:'每周',monthly:'每月',weekdays:'指定星期',workdays:'工作日',completion:'完成后按天'};
export function TaskScheduleDialog({task,onClose,onSave,seriesLocked=false}){
 const [original]=useState(task),[draft,setDraft]=useState(()=>scheduleSnapshot(task)),[view,setView]=useState('date'),[error,setError]=useState('');
 const wide=useSideSchedule();
 const staged={...original,...draft};
 const patch=fields=>{setDraft(d=>({...d,...fields}));setError('')};
 function save(next=draft){const result=scheduleChanges(original,task,next,{locked:seriesLocked});if(result.error){setError(result.error);return}if(Object.keys(result.fields).length)onSave(result.fields);onClose()}
 const clear=()=>{if(original.repeat!=='none'||draft.repeat!=='none')return;if((draft.time||draft.reminderAt||draft.extraReminders.length)&&!confirm('同时清除日期、计划时间及全部提醒？'))return;save({...draft,date:'',time:'',anchor:null,reminderAt:'',extraReminders:[]})};
 const count=Number(!!draft.reminderAt)+draft.extraReminders.length;
 const sections=[
  {key:'time',title:'计划时间',icon:Clock,label:'时间',value:draft.time||'未设置',active:!!draft.time,content:<><Field label="时间"><TimeControl inline label="计划时间" value={draft.time} onChange={time=>patch({time})}/></Field><p className="muted small">设置时间不会自动改变已有独立提醒。</p></>},
  {key:'reminder',title:'提醒设置',icon:Bell,label:'提醒',value:count?count+' 项':'未设置',active:!!count,content:<><div className="schedule-reminder-presets">{[0,1,5,15,60].map(m=><button type="button" className="secondary compact" key={m} disabled={!reminderBefore(draft.date,draft.time,m)} onClick={()=>patch({reminderAt:reminderBefore(draft.date,draft.time,m)})}>{m?'提前 '+m+' 分钟':'准时'}</button>)}</div><p className="muted small">快捷提醒按当前计划日期和时间换算为独立提醒；之后修改计划不会自动移动提醒。</p><ReminderFields task={staged} patch={patch}/></>},
  {key:'repeat',title:'重复规则',icon:Repeat,label:'重复',value:repeatNames[draft.repeat],active:draft.repeat!=='none',content:<>{seriesLocked?<p className="muted small">系列已暂停或存在冲突，请先在系列管理中处理。</p>:<RecurrenceFields task={staged} patch={patch}/>}<p className="muted small">仅修改当前待办及其后续生成规则，不修改历史实例。</p></>}
 ];
 const selected=sections.find(s=>s.key===view);
 return <Modal open onClose={onClose} title="选择日期" className="task-date-dialog task-schedule-dialog">
  <div hidden={!wide&&view!=='date'}><DatePicker inline selectionOnly required={draft.repeat!=='none'||original.repeat!=='none'} label="计划日期" value={draft.date} onChange={date=>patch({date,anchor:date?Number(date.slice(-2)):null})}/>
   <div className="schedule-options">{sections.map(({key,title,content,...option})=>wide?<ScheduleFlyout key={key} open={view===key} onOpenChange={open=>setView(v=>open?key:v===key?'date':v)} label={title} option={<ScheduleOption {...option}/>}>{content}</ScheduleFlyout>:<ScheduleOption key={key} {...option} onClick={()=>setView(key)}/>)}</div>
  </div>
  {!wide&&selected&&<ScheduleSubpanel title={selected.title} onBack={()=>setView('date')}>{selected.content}</ScheduleSubpanel>}
  {error&&<p role="alert" className="sync-error">{error}</p>}
  <div className="date-confirm-actions"><button type="button" className="secondary" disabled={original.repeat!=='none'||draft.repeat!=='none'} onClick={clear}>清除</button><button type="button" className="primary" onClick={()=>save()}>确定</button></div>
 </Modal>
}
