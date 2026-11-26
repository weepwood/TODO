import React,{useMemo,useState} from 'react';
import {WorkspaceSurface} from './WorkspaceSurface.jsx';
import {GoalPanel} from './GoalPanel.jsx';
import {DatePicker} from '../../components/DatePicker.jsx';
import {goalProgressAt} from '../../core/review-insights.js';
import {validDate} from '../../core/domain.js';

export function GoalWorkspace({data,today,storage,onClose,onOpenReport,onEditingChange}){
 const [date,setDate]=useState(today);
 const cutoff=validDate(date)&&date<=today?date:today;
 const insights=useMemo(()=>goalProgressAt(data,cutoff),[data.tasks,data.sessions,cutoff]);
 return <WorkspaceSurface page title="目标管理" className="goal-workspace" onClose={onClose} description="管理本机目标版本，查看所选日期的月度及年度累计实际进展。">
  <div className="goal-workspace-toolbar"><div><h2>目标与进展</h2><p className="muted small">所有清单 · 截至 {cutoff}</p></div><div className="review-dates"><DatePicker label="目标查询日期" value={cutoff} required onChange={d=>{if(validDate(d)&&d<=today)setDate(d)}}/><button className="secondary compact" onClick={()=>setDate(today)}>今天</button></div></div>
  <GoalPanel data={data} insights={insights} storage={storage} live standalone reportDate={cutoff} today={today} onOpenReport={onOpenReport} onEditingChange={onEditingChange}/>
 </WorkspaceSurface>
}
