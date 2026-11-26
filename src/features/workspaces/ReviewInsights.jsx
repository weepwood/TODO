import React from 'react';
import {Target,CalendarCheck,Clock,ChartNoAxesCombined} from 'lucide-react';
import {GoalPanel} from './GoalPanel.jsx';
const pct=v=>v===null?'—':v+'%';
const signed=v=>v>0?'+'+v:String(v);
export function ReviewInsights({insights:v,storage,live=false,print=false,reportDate,today,onEditingChange}){
 if(!v)return null;
 const metrics=[...(v.deadlineTotal===undefined?[]:[{name:'截止达成率',value:v.deadlineTotal?Math.round(v.deadlineMet/v.deadlineTotal*1000)/10+'%':'—',note:v.deadlineMet+' / '+v.deadlineTotal+' 项有截止的已完成任务',icon:CalendarCheck}]),{name:'当前计划完成率',value:pct(v.completionRate),note:v.plannedDone+' / '+v.planned+' 项当前区间计划',icon:CalendarCheck},{name:'按时完成率',value:pct(v.onTimeRate),note:v.onTime+' / '+v.dated+' 项有当前计划日期的已完成任务',icon:Clock},{name:'时长总偏差',value:v.matched?signed(v.bias)+' 分钟':'—',note:v.matched+' 项已完成且有绑定专注记录',icon:ChartNoAxesCombined},{name:'典型绝对偏差',value:v.medianError===null?'—':v.medianError+' 分钟',note:'匹配任务绝对误差中位数',icon:Target}];
 return <section className="review-section review-insights"><h3>完成效率与计划偏差</h3><div className="insight-metrics">{metrics.map(({name,value,note,icon:Icon})=><div key={name}><small><Icon size={15}/>{name}</small><strong>{value}</strong><p>{note}</p></div>)}</div><p className="muted small">基于当前计划日期和预计时长，不是原始计划历史。时长仅匹配本期完成任务在完成日及以前的绑定专注，排除休息及无记录任务；未跟踪的工作时间不可推断。</p>
 {v.matched>0&&<div className="insight-duration"><span>预计 <strong>{v.estimated} 分钟</strong></span><span>实际专注 <strong>{v.actual} 分钟</strong></span></div>}
 <GoalPanel insights={v} storage={storage} live={live} print={print} reportDate={reportDate} today={today} onEditingChange={onEditingChange}/>
 <h3>习惯与完成任务关联 · 最近90天内</h3><p className="muted small">从各习惯首次打卡与90天窗口较晚者起算，比较有打卡/无打卡日的平均完成数。至少14天且两组各3天；r 为点二列相关，不能证明习惯导致效率变化。未打卡不代表未执行习惯。</p>
 {v.habits.length?<div className="insight-habits">{v.habits.map(h=><div key={h.id}><div className="record-row"><strong>{h.name}</strong><small>{h.days} 天 · r {h.r===null?'—':h.r.toFixed(2)}</small></div><div className="insight-habit-groups"><span>打卡 {h.checked} 天 · {h.checkedMean===null?'—':h.checkedMean.toFixed(2)} 项/日</span><span>未打卡 {h.unchecked} 天 · {h.uncheckedMean===null?'—':h.uncheckedMean.toFixed(2)} 项/日</span></div>{h.r===null&&<small className="muted">样本不足或完成数无变化，无法计算关联。</small>}</div>)}</div>:<p className="muted small">暂无习惯记录。</p>}{v.habitTotal>30&&<p className="muted small">显示前30个习惯。</p>}
 </section>
}
