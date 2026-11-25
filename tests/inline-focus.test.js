import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState} from '../src/core/domain.js';
import {startFocusTimer,changeFocusTimer,focusTimerKey,focusDisplaySeconds,formatFocusClock,settleFocus} from '../src/core/focus-engine.js';
const now=Date.UTC(2026,10,26,0,0);
const base=()=>({...initialState(),tasks:[newTask('任务甲','inbox','', 'a'),newTask('任务乙','inbox','', 'b')]});
test('正计时启动、暂停、继续、结束只保存一次，并防止其他任务覆盖',()=>{
 const original=base(),s={...original,focusConfig:{...original.focusConfig,ignoreShortSessions:false}},a=startFocusTimer(s,{mode:'stopwatch',taskId:'a',now});
 assert.equal(a.timer.taskId,'a');assert.equal(a.timer.target,0);
 assert.equal(startFocusTimer(a,{mode:'focus',taskId:'b',minutes:25,now}),a);
 const key=focusTimerKey(a.timer),p=changeFocusTimer(a,{action:'pause',key,now:now+4000});
 assert.equal(focusDisplaySeconds(p.timer,now+15000),4);
 const r=changeFocusTimer(p,{action:'resume',key,now:now+20000});
 assert.equal(focusDisplaySeconds(r.timer,now+23000),7);
 const ended=changeFocusTimer(r,{action:'save',key,now:now+23000,sessionId:'one'});
 assert.equal(ended.timer,null);assert.equal(ended.sessions[0].seconds,7);assert.equal(ended.sessions[0].taskId,'a');
 assert.equal(changeFocusTimer(ended,{action:'save',key,now:now+24000,sessionId:'one'}),ended);
 const next=startFocusTimer(ended,{mode:'focus',taskId:'b',minutes:25,now:now+24000});
 assert.equal(changeFocusTimer(next,{action:'save',key,now:now+25000,sessionId:'two'}),next);
});
test('番茄到点自动结算与手动操作竞争不重复；历史任务不能新开计时',()=>{
 const s=base(),a=startFocusTimer(s,{mode:'focus',taskId:'a',minutes:1,now});
 assert.equal(focusDisplaySeconds(a.timer,now+10000),50);
 const key=focusTimerKey(a.timer),end=changeFocusTimer(a,{action:'pause',key,now:now+60000});
 assert.equal(end.sessions.length,1);assert.equal(end.sessions[0].seconds,60);assert.equal(end.timer,null);
 assert.equal(settleFocus(end,now+61000),end);
 assert.equal(changeFocusTimer(end,{action:'save',key,now:now+61000,sessionId:'repeat'}),end);
 const done={...s,tasks:s.tasks.map(t=>({...t,status:'completed'}))};
 assert.equal(startFocusTimer(done,{mode:'stopwatch',taskId:'a',now}),done);
 assert.equal(formatFocusClock(0),'00:00');assert.equal(formatFocusClock(1500),'25:00');assert.equal(formatFocusClock(3661),'01:01:01');
});

test('短时专注默认开启，旧数据默认补齐，关闭状态与已有记录保留',()=>{
 const s=base();assert.equal(s.focusConfig.ignoreShortSessions,true);
 const old={...s,focusConfig:{...s.focusConfig}};delete old.focusConfig.ignoreShortSessions;
 old.sessions=[{id:'old-short',taskId:'a',startedAt:new Date(now).toISOString(),seconds:15,mode:'focus'}];
 assert.equal(migrateState(old).focusConfig.ignoreShortSessions,true);
 assert.deepEqual(migrateState(old).sessions,old.sessions);
 old.focusConfig.ignoreShortSessions=false;assert.equal(migrateState(old).focusConfig.ignoreShortSessions,false);
});
test('正计时和番茄钟按累计有效秒数结算，59秒不计入，60秒正常保存',()=>{
 for(const mode of ['stopwatch','focus'])for(const seconds of [0,1,59,60,61])for(const ignoreShortSessions of [true,false]){
  const original=base(),s={...original,focusConfig:{...original.focusConfig,ignoreShortSessions}};
  const a=startFocusTimer(s,{mode,taskId:'a',minutes:25,now});
  const p=changeFocusTimer(a,{action:'pause',key:focusTimerKey(a.timer),now:now+seconds*1000});
  const ended=changeFocusTimer(p,{action:'save',key:focusTimerKey(p.timer),now:now+3600000,sessionId:'short'});
  const expected=seconds>0&&(!ignoreShortSessions||seconds>=60);
  assert.equal(ended.timer,null);assert.equal(ended.sessions.length,Number(expected));
  if(expected)assert.equal(ended.sessions[0].seconds,seconds);
 }
});
test('自动结算也遵循阈值，休息始终不计入，旧配置缺字段仍默认开启',()=>{
 const original=base(),s={...original,focusConfig:{...original.focusConfig}};
 delete s.focusConfig.ignoreShortSessions;
 const timer={mode:'focus',target:59,elapsed:0,startedAt:now,createdAt:new Date(now).toISOString(),taskId:'a'};
 assert.equal(settleFocus({...s,timer},now+59000).sessions.length,0);
 assert.equal(settleFocus({...s,timer,focusConfig:{...s.focusConfig,ignoreShortSessions:false}},now+59000).sessions.length,1);
 assert.equal(settleFocus({...s,timer:{...timer,target:60}},now+60000).sessions.length,1);
 assert.equal(settleFocus({...s,timer:{...timer,mode:'break',target:60}},now+60000).sessions.length,0);
});
