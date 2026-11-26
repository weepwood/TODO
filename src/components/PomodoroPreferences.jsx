import React from 'react';
import {Switch} from '../design-system/Controls.jsx';
import {InfoTip} from '../design-system/InfoTip.jsx';
import {SmartSelect,SelectOption} from './SmartSelect.jsx';
import {planningConfig} from '../core/pomodoro-planner.js';
export function PomodoroPreferences({config,update}){
 const p=planningConfig(config),set=(key,value)=>update(d=>({...d,focusConfig:{...d.focusConfig,[key]:value}}));
 const row=(key,label,help,disabled=false)=><div className="task-preference-row"><div><strong>{label}</strong> <InfoTip label={label+'说明'}>{help}</InfoTip></div><Switch aria-label={label} checked={p[key]} disabled={disabled} onCheckedChange={v=>set(key,v)}/></div>;
 return <div className="pomodoro-preferences"><h3>智能番茄规划</h3>
 {row('smartPlan','根据预计时长规划番茄钟','任务绑定的番茄钟根据预计时长自动拆分，关闭后使用标准专注周期。')}
 {row('deductFocus','自动扣除已专注时长','扣除本任务已保存的正计时与番茄时长；关闭后，每次新计划使用完整预计预算，连续周期内仍扣除本轮已完成时间。',!p.smartPlan)}
 <div className="task-preference-row"><div><strong>尾段番茄处理</strong> <InfoTip label="尾段处理说明">智能合并允许最后一个标准周期延长最多5分钟；严格周期不超过标准时长；均匀分配尽量平均。短时记录限制优先，必要时保留不足一分钟的剩余预算。</InfoTip></div><SmartSelect aria-label="尾段番茄处理" disabled={!p.smartPlan} value={p.planStrategy} onValueChange={v=>set('planStrategy',v)}><SelectOption value="merge">智能合并</SelectOption><SelectOption value="strict">严格标准周期</SelectOption><SelectOption value="balanced">均匀分配</SelectOption></SmartSelect></div>
 {row('planAutoContinue','连续执行番茄计划','自然到期后自动安排休息及下一个番茄，预算完成或任务结束后停止。手动提前结束后需重新启动；休眠超过一分钟不补记。',!p.smartPlan)}
 </div>
}
