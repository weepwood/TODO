import React,{useState} from 'react';
import {DateControl} from '../../components/DatePicker.jsx';
import {TimeControl} from '../../components/TimeControl.jsx';
import {NumberField} from '../../ui.jsx';
import {id,dayKey} from '../../core/domain.js';
import {validPlanSegments} from '../../core/plan-block.js';
export function PlanSegments({task,patch,locked}){
 const [date,setDate]=useState(task.date||dayKey()),[time,setTime]=useState('09:00'),[minutes,setMinutes]=useState(25),[open,setOpen]=useState(false);
 const rows=task.planSegments||[],disabled=locked||task.planLocked;
 return <div className="plan-segments"><div className="record-row"><strong>补充时间段 · {rows.length}</strong>{!disabled&&<button className="secondary compact" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'收起':'添加时间段'}</button>}</div>
 {rows.map(r=><div className="record-row" key={r.id}><span>{r.date} {r.time} · {r.minutes} 分钟</span>{!disabled&&<button className="text-link" aria-label={'移除时间段 '+r.date+' '+r.time} onClick={()=>patch({planSegments:rows.filter(x=>x.id!==r.id)})}>移除</button>}</div>)}
 {open&&!disabled&&<div className="plan-segment-editor"><DateControl label="补充时间段日期" value={date} onChange={setDate}/><TimeControl label="补充时间段时间" value={time} onChange={setTime}/><NumberField label="补充时间段分钟" unit="分钟" min={1} max={1440} value={minutes} onCommit={setMinutes}/><button className="primary compact" disabled={rows.length>=30||!validPlanSegments([{id:'draft',date,time,minutes}])} onClick={()=>{patch({planSegments:[...rows,{id:id(),date,time,minutes}]});setOpen(false)}}>保存时间段</button></div>}
 </div>
}
