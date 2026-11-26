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
