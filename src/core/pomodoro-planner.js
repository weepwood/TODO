// Pure planning in integer seconds; sessions remain the source of actual effort.
export const PLAN_STRATEGIES=['merge','strict','balanced'];
export function planningConfig(config={}){
 return {smartPlan:config.smartPlan!==false,deductFocus:config.deductFocus!==false,planStrategy:PLAN_STRATEGIES.includes(config.planStrategy)?config.planStrategy:'merge',planAutoContinue:config.planAutoContinue===true};
}
export function taskFocusSeconds(sessions,taskId){
 return Math.floor(sessions.reduce((sum,s)=>s.taskId===taskId&&['focus','stopwatch'].includes(s.mode)&&Number.isFinite(s.seconds)?sum+Math.max(0,s.seconds):sum,0));
}
export function splitPomodoro(seconds,standard,strategy='merge',minimum=60){
 const total=Math.max(0,Math.floor(seconds)),step=Math.max(60,Math.min(10800,Math.round(standard)));
 if(total<minimum)return [];
 const n=Math.floor(total/step),tail=total%step;
 let parts;
 if(strategy==='balanced'){
  const count=Math.ceil(total/step),size=Math.floor(total/count);
  // If a very small standard cycle cannot support a valid balanced split,
  // retain full cycles and leave the sub-threshold remainder unplanned.
  if(size>=minimum)return Array.from({length:count},(_,i)=>size+(i<total%count?1:0));
 }
 parts=Array(n).fill(step);
 if(tail){
  if(strategy==='merge'&&n&&tail<=300&&step+tail<=10800)parts[n-1]+=tail;
  else if(tail>=minimum)parts.push(tail);
  else if(n&&step-tail>=0&&step-(minimum-tail)>=minimum){parts[n-1]-=minimum-tail;parts.push(minimum)}
 }
 return parts;
}
export function pomodoroPlan(task,sessions,config,{baseline=undefined,reserved=0}={}){
 const prefs=planningConfig(config),standard=Math.max(60,Math.min(10800,Math.round((Number(config.focus)||25)*60)));
 const budget=task&&Number.isFinite(task.duration)&&task.duration>0?Math.min(86400,Math.round(task.duration*60)):0;
 const actual=task?taskFocusSeconds(sessions,task.id):0;
 const credited=prefs.deductFocus?actual:baseline===undefined?0:Math.max(0,actual-baseline);
 const remaining=Math.max(0,budget-credited),minimum=config.ignoreShortSessions===false?1:60;
 const enabled=prefs.smartPlan&&budget>0;
 const available=Math.max(0,remaining-Math.max(0,reserved));
 const segments=enabled?splitPomodoro(available,standard,prefs.planStrategy,minimum):[];
 const plannedSeconds=segments.reduce((a,b)=>a+b,0);
 return {enabled,budget,actual,remaining,segments,standard,unplanned:available-plannedSeconds,next:segments[0]||(enabled&&remaining>0&&remaining<minimum?minimum:standard),achieved:enabled&&remaining===0};
}
export function plannedBreakSeconds(config,count){
 return Math.round((count>0&&count%Math.max(1,Math.floor(config.cycles||4))===0?config.longBreak:config.break)*60);
}
export function plannedRestSeconds(config,segments,completedCount=0){
 return segments.slice(0,-1).reduce((sum,_,i)=>sum+plannedBreakSeconds(config,completedCount+i+1),0);
}
