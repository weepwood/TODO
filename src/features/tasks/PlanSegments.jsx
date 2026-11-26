import React,{useState} from 'react';
import {DateControl} from '../../components/DatePicker.jsx';
import {TimeControl} from '../../components/TimeControl.jsx';
import {NumberField,ActionButton} from '../../ui.jsx';
import {id,dayKey} from '../../core/domain.js';
import {validPlanSegments} from '../../core/plan-block.js';
export function PlanSegments({task,patch,locked}){
 const [draft,setDraft]=useState(null),[expected,setExpected]=useState(null);
 const rows=task.planSegments||[],disabled=locked||task.planLocked;
 const stale=expected!==null&&JSON.stringify(expected)!==JSON.stringify(rows);
 function begin(row){setExpected(rows);setDraft(row?{...row}:{id:'',date:task.date||dayKey(),time:'09:00',minutes:25})}
 function cancel(){setDraft(null);setExpected(null)}
 function save(){
  if(!draft||stale||disabled)return;
  const row={...draft,id:draft.id||id()},next=draft.id?rows.map(r=>r.id===draft.id?row:r):[...rows,row];
  if(!validPlanSegments(next))return;
  patch({planSegments:next},{expectedSegments:expected});cancel()
 }
 return <div className="plan-segments"><div className="record-row"><strong>补充时间段 · {rows.length}</strong>{!disabled&&<ActionButton compact aria-expanded={!!draft} disabled={rows.length>=30&&!draft} onClick={()=>draft?cancel():begin(null)}>{draft?'收起':'添加时间段'}</ActionButton>}</div>
 {rows.map(r=><div className="record-row" key={r.id}><span>{r.date} {r.time} · {r.minutes} 分钟</span>{!disabled&&<div className="workspace-actions"><ActionButton compact aria-label={'编辑时间段 '+r.date+' '+r.time} onClick={()=>begin(r)}>编辑</ActionButton><button type="button" className="text-link" aria-label={'移除时间段 '+r.date+' '+r.time} onClick={()=>{patch({planSegments:rows.filter(x=>x.id!==r.id)},{expectedSegments:rows});cancel()}}>移除</button></div>}</div>)}
 {draft&&!disabled&&<div className="plan-segment-editor"><DateControl label="补充时间段日期" value={draft.date} onChange={date=>setDraft(d=>({...d,date}))}/><TimeControl label="补充时间段时间" value={draft.time} onChange={time=>setDraft(d=>({...d,time}))}/><NumberField label="补充时间段分钟" unit="分钟" min={1} max={1440} value={draft.minutes} onCommit={minutes=>setDraft(d=>({...d,minutes}))}/><div className="workspace-actions"><ActionButton compact onClick={cancel}>取消</ActionButton><ActionButton variant="primary" compact disabled={stale||(!draft.id&&rows.length>=30)||!validPlanSegments([{...draft,id:draft.id||'draft'}])} onClick={save}>保存时间段</ActionButton></div>{stale&&<p role="alert">时间段已变化，请重新编辑。</p>}</div>}
 </div>
}
