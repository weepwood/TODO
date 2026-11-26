import React,{useMemo} from 'react';
import {Clock,Timer,Play,Pause,Square} from 'lucide-react';
import {pomodoroPlan} from '../../core/pomodoro-planner.js';
import {PomodoroPlan,durationText} from './PomodoroPlan.jsx';
import {dayKey} from '../../core/domain.js';
import {startFocusTimer,changeFocusTimer,focusTimerKey,focusDisplaySeconds,formatFocusClock,focusCountOnDay} from '../../core/focus-engine.js';

export function InlineFocus({task,data,now,update,locked,summary}){
 const timer=data.timer,own=timer?.taskId===task.id,running=own&&timer.startedAt!==null;
 const activeTarget=own&&timer.mode==='focus'?timer.target:0;
 const baseline=own&&timer.planned?timer.planBaseline:undefined,today=dayKey(new Date(now));
 const plan=useMemo(()=>pomodoroPlan(task,data.sessions,data.focusConfig,{baseline,reserved:activeTarget}),[task,data.sessions,data.focusConfig,baseline,activeTarget]);
 const launch=useMemo(()=>pomodoroPlan(task,data.sessions,data.focusConfig),[task,data.sessions,data.focusConfig]);
 const count=useMemo(()=>focusCountOnDay(data.sessions,now),[data.sessions,today]);
 const start=mode=>{const at=Date.now();update(d=>startFocusTimer(d,{mode,minutes:d.focusConfig.focus,taskId:task.id,now:at,planned:mode==='focus'}))};
 const control=action=>{const key=focusTimerKey(timer),at=Date.now();update(d=>changeFocusTimer(d,{action,key,now:at}))};
 const other=timer&&!own;
 const otherTitle=other?(data.tasks.find(t=>t.id===timer.taskId)?.title||'其他计时'):'';
 return <div className="inline-focus" role="group" aria-label="任务内专注">
  <div className="inline-focus-header"><span><Clock size={14}/>专注</span><small className="task-focus-summary">实际专注 {durationText(plan.actual)} · {summary.count} 次</small></div>
  {own?<div className="inline-focus-controls" data-active="true">
   <button type="button" className="focus-capsule focus-capsule-live" aria-label={running?'暂停当前专注':'继续当前专注'} title={running?'暂停':'继续'} onClick={()=>control(running?'pause':'resume')}>
    {timer.mode==='stopwatch'?<Clock size={15}/>:<Timer size={15}/>}<span className="focus-capsule-time">{formatFocusClock(focusDisplaySeconds(timer,now))}</span><span className="focus-capsule-label">{timer.mode==='break'?'休息':timer.mode==='focus'?'番茄钟':'正计时'} · {running?'进行中':'已暂停'}</span>{running?<Pause size={15}/>:<Play size={15}/>}
   </button><button type="button" className="focus-capsule focus-capsule-stop" aria-label="结束并保存专注" title="结束并保存（休息不计入专注）" onClick={()=>control('save')}><Square size={13}/><span>结束</span></button>
  </div>:!locked?<><div className="inline-focus-controls">
   <button type="button" className="focus-capsule" disabled={!!other} aria-label="开始正计时" title="开始正计时" onClick={()=>start('stopwatch')}><Clock size={15}/><span className="focus-capsule-time">00:00</span><span className="focus-capsule-label">正计时</span><Play size={12}/></button>
   <button type="button" className="focus-capsule" disabled={!!other} aria-label="开始番茄钟" title={launch.enabled?"按任务时间预算开始":"按全局番茄钟时长开始"} onClick={()=>start('focus')}><Timer size={15}/><span className="focus-capsule-time">{formatFocusClock(launch.next)}</span><span className="focus-capsule-label">{launch.achieved?"额外番茄":"番茄钟"}</span><Play size={12}/></button>
  </div>{other&&<div className="inline-focus-occupied" role="status">正在计时：{otherTitle} · {formatFocusClock(focusDisplaySeconds(timer,now))}，请先结束该计时。</div>}</>:null}
  <PomodoroPlan plan={plan} config={data.focusConfig} completedCount={count+(activeTarget?1:0)} activeTarget={activeTarget} locked={locked}/>
 </div>
}
