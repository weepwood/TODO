import test from 'node:test';
import assert from 'node:assert/strict';
import {timerSeconds,shiftDay,initialState,newTask} from '../src/core/domain.js';
import {timelineMove} from '../src/core/timeline-layout.js';
import {deadlineEnd} from '../src/core/deadline.js';
import {startFocusTimer,changeFocusTimer,focusTimerKey,settleFocus} from '../src/core/focus-engine.js';
test('系统时钟向后调整不扣除已累计暂停时长',()=>{
 const timer={elapsed:120,startedAt:1000000};
 assert.equal(timerSeconds(timer,900000),120);
 assert.equal(timerSeconds(timer,1060000),180);
});
test('日历墙钟跨日与实际计时秒数分离',()=>{
 const date='2026-03-08',next=shiftDay(date,1);assert.equal(next,'2026-03-09');
 assert.equal(timelineMove(date,23*60+45,15).date,next);
 assert.equal(new Date(deadlineEnd(date)).getHours(),23);
 const d={...initialState(),tasks:[newTask('跨日','inbox',date,'a')]},at=Date.parse('2026-03-08T06:59:30Z');
 const s=startFocusTimer(d,{mode:'focus',minutes:1,taskId:'a',now:at});
 const done=settleFocus(s,at+60000);assert.equal(done.sessions[0].seconds,60);
 const t=startFocusTimer(d,{mode:'stopwatch',taskId:'a',now:at});
 const pause=changeFocusTimer(t,{action:'pause',key:focusTimerKey(t.timer),now:at+120000});
 const resume=changeFocusTimer(pause,{action:'resume',key:focusTimerKey(pause.timer),now:at+180000});
 assert.equal(timerSeconds(resume.timer,at+160000),120);
});

test('纽约夏令时跳时与重复小时：日历日期、实际计时及休眠停止保持独立',()=>{
 const old=process.env.TZ;
 try{
  process.env.TZ='America/New_York';
  for(const [date,hours,start] of [['2026-03-08',23,'2026-03-08T06:59:30Z'],['2026-11-01',25,'2026-11-01T05:59:30Z']]){
   const dayStart=new Date(date+'T00:00:00').getTime(),next=shiftDay(date,1);
   assert.equal(new Date(next+'T00:00:00').getTime()-dayStart,hours*3600000);
   assert.equal(deadlineEnd(date)+1-dayStart,hours*3600000);
   const d={...initialState(),focusConfig:{...initialState().focusConfig,autoContinue:true},tasks:[newTask('DST','inbox',date,'a')]},at=Date.parse(start);
   const s=startFocusTimer(d,{mode:'focus',minutes:1,taskId:'a',now:at});
   const done=settleFocus(s,at+60000);assert.equal(done.sessions[0].seconds,60);assert.equal(done.timer.mode,'break');
   const slept=settleFocus(s,at+8*3600000);assert.equal(slept.sessions.length,1);assert.equal(slept.timer,null);
   assert.equal(settleFocus(slept,at+9*3600000),slept);
  }
 }finally{if(old===undefined)delete process.env.TZ;else process.env.TZ=old}
});
