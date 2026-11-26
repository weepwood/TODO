import {validQueueRun,queueRunProgress,finishQueueRun,makeQueueRun} from './focus-queue.js';
import {pomodoroPlan,planningConfig,taskFocusSeconds,plannedBreakSeconds,splitPomodoro} from './pomodoro-planner.js';
import {dayKey,timerSeconds} from './domain.js';
export function shouldSaveFocus(config,mode,seconds){return (mode==='focus'||mode==='stopwatch')&&Number.isFinite(seconds)&&seconds>0&&(config?.ignoreShortSessions===false||seconds>=60)}
// The same logical timer must produce the same record on every device,
// whether it is saved manually or reaches its target automatically.
export function focusSessionId(t){return 'timer:'+(t.phaseAt??t.createdAt)+':'+t.mode+':'+JSON.stringify(t.taskId??null)}
function hasTimerSession(sessions,t){
 const legacy='timer:'+t.createdAt+':'+t.mode;
 return sessions.some(s=>(s.id===focusSessionId(t)||s.id===legacy&&s.startedAt===t.createdAt)&&s.mode===t.mode&&(s.taskId??null)===(t.taskId??null));
}
// The record belongs to its starting local day, matching history and statistics.
export function focusCountOnDay(sessions,at){
 const day=dayKey(new Date(at));
 return sessions.filter(s=>s.mode==='focus'&&dayKey(new Date(s.startedAt))===day).length;
}
export function focusDue(t,now){return !!t&&t.startedAt!==null&&t.mode!=='stopwatch'&&t.target>0&&timerSeconds(t,now)>=t.target}
export function settleFocus(state,now=Date.now()){
 const t=state.timer;
 if(!focusDue(t,now))return state;
 const end=t.startedAt+Math.max(0,t.target-t.elapsed)*1000;
 const endIso=new Date(end).toISOString();
 const eventId='timer:'+(t.phaseAt??t.createdAt)+':'+t.mode;
 let sessions=state.sessions,notifications=state.notifications;
 if(shouldSaveFocus(state.focusConfig,t.mode,t.target)&&t.mode==='focus'&&!hasTimerSession(sessions,t))sessions=[...sessions,{id:focusSessionId(t),taskId:t.taskId,startedAt:t.createdAt,seconds:t.target,mode:'focus',...(t.queueRun?.startedAt?{queueRunId:t.queueRun.id}:{})}];
 if(!notifications.some(n=>n.id===eventId))notifications=[...notifications,{id:eventId,title:t.mode==='focus'?'专注结束':'休息结束',at:endIso}].slice(-100);
 const c=state.focusConfig;
 // Only advance a recently completed phase. Never fill in unattended sessions after sleep.
 let timer=null;
 if(now-end<=60000){
  const task=state.tasks.find(x=>x.id===t.taskId&&x.status==='pending'&&!x.deletedAt);
  const count=focusCountOnDay(sessions,t.mode==='focus'?t.createdAt:end);
  // Do not charge time before a phase was actually started by this tick.
  const nextStart=Math.max(end,now),nextIso=new Date(nextStart).toISOString();
  const mode=t.mode==='focus'?'break':'focus';
  if(t.queueRun){
   const progress=queueRunProgress(t.queueRun,{...state,sessions});
   if(progress.next){
    const next=progress.next;
    timer={mode,target:mode==='focus'?queueTarget(next.remaining,c):plannedBreakSeconds(c,count),elapsed:0,startedAt:nextStart,createdAt:nextIso,phaseAt:endIso,taskId:next.id,queueRun:t.queueRun};
   }
  }else if(t.planned){
   const plan=task&&pomodoroPlan(task,sessions,c,{baseline:t.planBaseline});
   if(planningConfig(c).planAutoContinue&&plan?.enabled&&plan.segments.length){
    timer={mode,target:mode==='focus'?plan.segments[0]:plannedBreakSeconds(c,count),elapsed:0,startedAt:nextStart,createdAt:nextIso,phaseAt:endIso,taskId:t.taskId,planned:true,planBaseline:t.planBaseline??0};
   }
  }else if(c.autoContinue===true&&(!t.taskId||task)){
   timer={mode,target:mode==='focus'?c.focus*60:plannedBreakSeconds(c,count),elapsed:0,startedAt:nextStart,createdAt:nextIso,phaseAt:endIso,taskId:t.taskId||null};
  }
 }
 const next={...state,sessions,notifications,timer};return !timer&&t.queueRun?finishQueueRun(next,t,now,now-end>60000?'sleep':'natural'):next;
}

// Both workspace and inline controls operate on the same persisted timer.
// Identity fencing prevents stale controls from replacing a newer session.
export function focusTimerKey(timer){return timer?JSON.stringify([timer.phaseAt??timer.createdAt,timer.mode,timer.taskId??null]):null}
export function startFocusTimer(state,{mode,minutes,taskId=null,now,planned=false}){
 if(state.timer||!Number.isFinite(now)||!['focus','stopwatch','break'].includes(mode))return state;
 if(taskId&&!state.tasks.some(t=>t.id===taskId&&t.status==='pending'&&!t.deletedAt))return state;
 const task=state.tasks.find(t=>t.id===taskId);
 const plan=planned&&mode==='focus'&&task?pomodoroPlan(task,state.sessions,state.focusConfig):null;
 const usePlan=!!plan?.enabled;
 if(mode!=='stopwatch'&&!usePlan&&(!Number.isFinite(minutes)||minutes<1||minutes>180))return state;
 const target=mode==='stopwatch'?0:usePlan?plan.next:Math.round(minutes*60);
 return {...state,timer:{mode,target,elapsed:0,startedAt:now,createdAt:new Date(now).toISOString(),taskId,...(usePlan?{planned:true,planBaseline:taskFocusSeconds(state.sessions,taskId)}:{})}};
}
export function changeFocusTimer(state,{action,key,now}){
 const t=state.timer;
 if(!t||focusTimerKey(t)!==key||!Number.isFinite(now))return state;
 // A due countdown is settled once, even if clicked just before the next tick.
 const settled=settleFocus(state,now);if(settled!==state)return ['save','discard'].includes(action)?finishQueueRun({...settled,timer:null},t,now,action==='save'?'manual':'discard'):settled;
 if(action==='pause'&&t.startedAt!==null)return {...state,timer:{...t,elapsed:timerSeconds(t,now),startedAt:null}};
 if(action==='resume'&&t.startedAt===null)return {...state,timer:{...t,startedAt:now}};
 if(action==='discard'||action==='save'){
  const seconds=Math.min(timerSeconds(t,now),t.mode==='stopwatch'?Infinity:t.target);
  const save=action==='save'&&shouldSaveFocus(state.focusConfig,t.mode,seconds)&&!hasTimerSession(state.sessions,t);
  const next={...state,timer:null,sessions:save?[...state.sessions,{id:focusSessionId(t),taskId:t.taskId,startedAt:t.createdAt,seconds,mode:t.mode,...(t.queueRun?.startedAt?{queueRunId:t.queueRun.id}:{})}]:state.sessions};return finishQueueRun(next,t,now,action==='save'?'manual':'discard');
 }
 return state;
}
export function focusDisplaySeconds(timer,now){const seconds=timerSeconds(timer,now);return timer.mode==='stopwatch'?seconds:Math.max(0,timer.target-seconds)}
export function formatFocusClock(seconds){
 const n=Math.max(0,Math.floor(seconds)),h=Math.floor(n/3600),m=Math.floor(n/60)%60,s=n%60;
 return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

// Start only from an explicit user action. Natural completion advances; manual
// stop/discard and delayed wake never advance the queue.
function queueTarget(remaining,config){return splitPomodoro(remaining,config.focus*60,planningConfig(config).planStrategy,60)[0]||60}
export function startQueueRun(state,run,now){
 if(state.timer||!validQueueRun(run)||run.startedAt||!Number.isFinite(now)||state.queueHistory?.some(r=>r.id===run.id)||state.sessions.some(s=>s.queueRunId===run.id))return state;
 // The preview's budget and eligibility must still match at the transaction boundary.
 const fresh=makeQueueRun({items:run.items},state,run.goal,run.id);
 if(!fresh||JSON.stringify(fresh.items)!==JSON.stringify(run.items))return state;
 const next=queueRunProgress(run,state).next;if(!next)return state;
 const target=queueTarget(next.remaining,state.focusConfig);
 return {...state,timer:{mode:'focus',target,elapsed:0,startedAt:now,createdAt:new Date(now).toISOString(),taskId:next.id,queueRun:{...run,startedAt:run.startedAt||new Date(now).toISOString()}}};
}
