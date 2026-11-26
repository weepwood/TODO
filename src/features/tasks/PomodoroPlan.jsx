import React from 'react';
import {Timer,Coffee,Check,ChevronRight} from 'lucide-react';
import {PropertyPopover} from '../../components/EditableProperty.jsx';
import {InfoTip} from '../../design-system/InfoTip.jsx';
import {plannedBreakSeconds,plannedRestSeconds} from '../../core/pomodoro-planner.js';
export function durationText(seconds){
 const s=Math.max(0,Math.floor(seconds)),m=Math.floor(s/60),r=s%60;
 return (m?m+' 分钟':'')+(r?(m?' ':'')+r+' 秒':m?'':'0 分钟');
}
export function PomodoroPlan({plan,config,completedCount,activeTarget=0,locked}){
 const {budget,actual,remaining,segments,enabled,unplanned}=plan;
 if(!budget)return null;
 const ratio=Math.min(100,actual/budget*100),rest=plannedRestSeconds(config,segments,completedCount);
 const nextTotal=segments.reduce((a,b)=>a+b,0);
 const summary=actual>=budget?'已达到预计时长'+(actual>budget?' · 超出 '+durationText(actual-budget):''):'剩余预计 '+durationText(budget-actual);
 return <div className="pomodoro-plan task-time-comparison" role="group" aria-label="专注时间预算">
  <div className="pomodoro-budget"><span>预计 {durationText(budget)}</span><span>实际 {durationText(actual)}</span></div>
  <div className="pomodoro-budget-track" role="progressbar" aria-label="预计时长完成率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio)}><span style={{width:ratio+'%'}}/></div>
  <div className="pomodoro-budget-summary"><small>{summary}</small>{enabled&&!locked&&<small>{segments.length} 个待执行番茄</small>}</div>
  {enabled&&!locked&&<><div className="pomodoro-plan-header"><span>智能番茄规划 <InfoTip label="智能番茄规划说明">根据当前预算和已保存的有效专注重新计算。正在运行的计时不改变；休息不计入专注，计划不等于实际记录。</InfoTip></span>
   <PropertyPopover label="查看番茄计划" value={<>详情<ChevronRight size={12}/></>} chevron={false} className="pomodoro-plan-popover">{close=><><h4>剩余番茄计划</h4>{activeTarget>0&&<p className="muted small">当前番茄目标 {durationText(activeTarget)}，不包含在下列待执行计划中。</p>}<div className="pomodoro-plan-list">{segments.slice(0,100).map((seconds,i)=><React.Fragment key={i}><div className="pomodoro-plan-step"><Timer size={14}/><span>第 {i+1} 个待执行番茄</span><strong>{durationText(seconds)}</strong></div>{i<segments.length-1&&<div className="pomodoro-plan-step rest"><Coffee size={13}/><span>间隔休息</span><small>{durationText(plannedBreakSeconds(config,completedCount+i+1))}</small></div>}</React.Fragment>)}{segments.length>100&&<p className="muted small">另有 {segments.length-100} 个周期</p>}{!segments.length&&<p className="muted small">暂无待执行周期</p>}</div><div className="pomodoro-plan-total">待执行专注 {durationText(nextTotal)} · 间隔休息 {durationText(rest)}<br/>预计合计 {durationText(nextTotal+rest)}</div><button type="button" className="secondary" onClick={close}>关闭</button></>}</PropertyPopover></div>
  {!!segments.length&&<div className="pomodoro-segments" aria-label="番茄分段">{segments.slice(0,12).map((s,i)=><span key={i} title={durationText(s)} style={{flex:s}} data-next={i===0||undefined}/>)}{segments.length>12&&<span style={{flex:segments.slice(12).reduce((a,b)=>a+b,0)}}/>}</div>}
  <div className="pomodoro-segment-labels">{segments.slice(0,8).map((s,i)=><span key={i}>{durationText(s)}</span>)}{segments.length>8&&<small>另有 {segments.length-8} 个</small>}{!segments.length&&remaining===0&&<span><Check size={12}/> 已达预算，可额外专注</span>}</div>
  {unplanned>0&&<small className="muted">剩余 {durationText(unplanned)} 未分段；不足记录阈值时可手动补足。</small>}
  {activeTarget>0&&<small className="muted">当前番茄 {durationText(activeTarget)} · 后续计划不影响当前计时</small>}
  </>}
 </div>
}
