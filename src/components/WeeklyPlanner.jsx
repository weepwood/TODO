import React,{useState,useMemo} from 'react';
import {Modal,ActionButton} from '../ui.jsx';
import {TimeControl} from './TimeControl.jsx';
import {CheckInput} from '../design-system/Controls.jsx';
import {SmartSelect,SelectOption} from './SmartSelect.jsx';
import {defaultWeek,readWeek,saveWeek,validWeek,previewWeekReflow,applyWeekReflow,elapsedBudget} from '../core/weekly-planner.js';
import {calendarBusy} from '../core/productivity.js';
import {shiftDay,validDate} from '../core/domain.js';
export default function WeeklyPlanner({storage,data,date,update,onClose}){
 const [initial]=useState(()=>{try{return {rows:readWeek(storage)||defaultWeek(),error:''}}catch(e){return {rows:defaultWeek(),error:e.message}}});
 const [week,setWeek]=useState(initial.rows),[days,setDays]=useState(7),[proposal,setProposal]=useState(null),[message,setMessage]=useState(initial.error);
 const budgets=useMemo(()=>Array.from({length:days},(_,i)=>shiftDay(date,i)).filter(validDate).map(d=>{const h=week[new Date(d+'T12:00:00').getDay()];return {date:d,enabled:h.enabled,budget:h.enabled?elapsedBudget([...data.tasks,...calendarBusy(data.calendarEvents)],d,h.start,h.end):null}}),[data,date,week,days]);
 const edit=(day,fields)=>{setWeek(old=>old.map(r=>r.day===day?{...r,...fields}:r));setProposal(null)};
 return <Modal open title="工作周与多日重排" onClose={onClose} className="professional-form-dialog weekly-planner-dialog" description="每周本机时段用于此工作台的多日重排；原单日智能安排设置保持独立。按实际经过分钟计算容量，不自动移动锁定或复杂任务。">
 <div className="weekly-planner-grid"><section><h3>每周工作时段</h3><div className="professional-preview weekly-hours-list">{[1,2,3,4,5,6,0].map(day=><div className="record-row weekly-hours-row" key={day}><label className="compact-checkbox"><CheckInput checked={week[day].enabled} onChange={e=>edit(day,{enabled:e.target.checked})}/>周{'日一二三四五六'[day]}</label><TimeControl label={'周'+day+'开始'} value={week[day].start} required onChange={start=>edit(day,{start})}/><TimeControl label={'周'+day+'结束'} value={week[day].end} required onChange={end=>edit(day,{end})}/></div>)}</div>
 <div className="workspace-actions"><ActionButton disabled={!validWeek(week)||!!initial.error} onClick={()=>{try{saveWeek(storage,week);setMessage('工作周已保存')}catch(e){setMessage(e.message)}}}>保存工作周</ActionButton><SmartSelect aria-label="多日范围" value={String(days)} onValueChange={v=>{setDays(+v);setProposal(null)}}><SelectOption value="3">三日</SelectOption><SelectOption value="7">七日</SelectOption></SmartSelect></div></section>
 <section><h3>多日容量</h3><div className="professional-preview" aria-label="多日容量">{budgets.map(r=><div className="record-row" key={r.date}><span>{r.date}</span><small>{!r.enabled?'休息日':r.budget?'剩余 '+Math.round(r.budget.remaining*10)/10+' / '+r.budget.capacity+' 分钟':'时间边界不可安全表示'}</small></div>)}</div>
 {proposal&&<div className="professional-preview" aria-label="多日重排预览">{proposal.length?proposal.map(r=><div className="record-row" key={r.id}><span>{r.title}</span><small>{r.fromDate} {r.from} → {r.date} {r.to}</small></div>):<p className="muted">没有可安全重排的任务。</p>}</div>}
 </section></div>
 {message&&<p role="status">{message}</p>}<div className="dialog-actions"><ActionButton disabled={!validWeek(week)} onClick={()=>setProposal(previewWeekReflow(data,date,week,days))}>预览多日重排</ActionButton><ActionButton variant="primary" disabled={!proposal?.length} onClick={()=>{const fresh=previewWeekReflow(data,date,week,days);if(JSON.stringify(fresh)!==JSON.stringify(proposal)){setProposal(fresh);setMessage('数据变化，请重新核对');return}update(d=>applyWeekReflow(d,date,week,days,proposal));onClose()}}>确认多日重排</ActionButton></div></Modal>
}
