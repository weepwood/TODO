import {dayKey,timerSeconds} from './domain.js';
export function settleFocus(state,now=Date.now()){
 const t=state.timer;
 if(!t||t.startedAt===null||t.mode==='stopwatch'||t.target<=0||timerSeconds(t,now)<t.target)return state;
 const end=t.startedAt+Math.max(0,t.target-t.elapsed)*1000;
 const endIso=new Date(end).toISOString();
 const eventId='timer:'+t.createdAt+':'+t.mode;
 let sessions=state.sessions,notifications=state.notifications;
 if(t.mode==='focus'&&!sessions.some(s=>s.id===eventId))sessions=[...sessions,{id:eventId,taskId:t.taskId,startedAt:t.createdAt,seconds:t.target,mode:'focus'}];
 if(!notifications.some(n=>n.id===eventId))notifications=[...notifications,{id:eventId,title:t.mode==='focus'?'专注结束':'休息结束',at:endIso}].slice(-100);
 const c=state.focusConfig;
 // Only advance a recently completed phase. Never fill in unattended sessions after sleep.
 let timer=null;
 if(c.autoContinue===true&&now-end<=60000){
  const count=sessions.filter(s=>s.mode==='focus'&&dayKey(new Date(s.startedAt))===dayKey(new Date(end))).length;
  const mode=t.mode==='focus'?'break':'focus',minutes=mode==='focus'?c.focus:count>0&&count%c.cycles===0?c.longBreak:c.break;
  timer={mode,target:minutes*60,elapsed:0,startedAt:end,createdAt:endIso,taskId:t.taskId||null};
 }
 return {...state,sessions,notifications,timer};
}
