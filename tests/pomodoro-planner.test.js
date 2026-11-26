import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState} from '../src/core/domain.js';
import {splitPomodoro,pomodoroPlan,plannedRestSeconds} from '../src/core/pomodoro-planner.js';
import {startFocusTimer,settleFocus,changeFocusTimer,focusTimerKey} from '../src/core/focus-engine.js';
const now=Date.UTC(2026,10,26,0,0),base=(duration=80)=>({...initialState(),tasks:[{...newTask('计划任务','inbox','','a'),duration}]});
const mins=(n,s='merge')=>splitPomodoro(n*60,1500,s).map(x=>x/60);
test('三种拆分策略与尾段合并示例',()=>{
 for(const [n,expected] of [[10,[10]],[25,[25]],[26,[26]],[30,[30]],[31,[25,6]],[40,[25,15]],[51,[25,26]],[80,[25,25,30]],[90,[25,25,25,15]],[120,[25,25,25,25,20]]])assert.deepEqual(mins(n),expected);
 assert.deepEqual(mins(80,'strict'),[25,25,25,5]);assert.deepEqual(mins(80,'balanced'),[20,20,20,20]);
});
test('秒级预算、短时阈值、整数与容量边界',()=>{
 for(const strategy of ['merge','strict','balanced'])for(const standard of [60,120,900,1500,10800])for(const seconds of [0,1,59,60,61,119,120,1501,1505,1801,86399,86400]){
  const parts=splitPomodoro(seconds,standard,strategy,60),sum=parts.reduce((a,b)=>a+b,0);
  assert.ok(parts.every(n=>Number.isInteger(n)&&n>=60&&n<=10800&&n<=(strategy==='merge'?standard+300:standard)));
  assert.ok(sum<=seconds&&seconds-sum<60);
 }
 assert.deepEqual(splitPomodoro(1501,1500,'strict'),[1441,60]);
 assert.deepEqual(splitPomodoro(59,1500,'strict',1),[59]);
});
test('旧数据默认开启，关闭设置保持，实际秒数仅扣除对应任务记录',()=>{
 let s=base(31);s.sessions=[{id:'a1',taskId:'a',seconds:65,mode:'stopwatch',startedAt:new Date(now).toISOString()},{id:'b1',taskId:'b',seconds:999,mode:'focus',startedAt:new Date(now).toISOString()}];
 const plan=pomodoroPlan(s.tasks[0],s.sessions,s.focusConfig);assert.equal(plan.actual,65);assert.equal(plan.remaining,1795);assert.deepEqual(plan.segments,[1795]);
 assert.equal(pomodoroPlan(s.tasks[0],s.sessions,{...s.focusConfig,deductFocus:false}).remaining,1860);
 assert.equal(pomodoroPlan(s.tasks[0],s.sessions,{...s.focusConfig,smartPlan:false}).next,1500);
 const old={...s,focusConfig:{...s.focusConfig}};for(const k of ['smartPlan','deductFocus','planStrategy','planAutoContinue'])delete old.focusConfig[k];
 assert.equal(migrateState(old).focusConfig.smartPlan,true);assert.equal(migrateState(old).focusConfig.deductFocus,true);
 assert.equal(migrateState({...s,focusConfig:{...s.focusConfig,smartPlan:false}}).focusConfig.smartPlan,false);
 assert.equal(plannedRestSeconds(s.focusConfig,[1500,1500,1500,900],2),1500);
});
test('连续计划自然结算、休息、动态预算更新、到达预算停止',()=>{
 let s=base(40);s.focusConfig.planAutoContinue=true;
 s=startFocusTimer(s,{mode:'focus',minutes:25,taskId:'a',now,planned:true});assert.equal(s.timer.target,1500);
 s={...s,tasks:s.tasks.map(t=>({...t,duration:31}))};assert.equal(s.timer.target,1500);
 s=settleFocus(s,now+1500000);assert.equal(s.sessions.length,1);assert.equal(s.timer.mode,'break');assert.equal(s.timer.target,300);
 s=settleFocus(s,now+1800000);assert.equal(s.timer.target,360);
 s=settleFocus(s,now+2160000);assert.equal(s.timer,null);assert.equal(s.sessions.reduce((n,x)=>n+x.seconds,0),1860);
 assert.equal(settleFocus(s,now+2200000),s);
});
test('不扣除历史也能终止当前连续周期，休眠与任务结束不续跑',()=>{
 let s=base(40);s.focusConfig={...s.focusConfig,planAutoContinue:true,deductFocus:false};s.sessions=[{id:'old',taskId:'a',seconds:600,mode:'focus',startedAt:new Date(now-600000).toISOString()}];
 const a=startFocusTimer(s,{mode:'focus',minutes:25,taskId:'a',now,planned:true});
 assert.equal(a.timer.planBaseline,600);assert.equal(settleFocus(a,now+1561000).timer,null);
 assert.equal(settleFocus({...a,tasks:a.tasks.map(t=>({...t,status:'completed'}))},now+1500000).timer,null);
 const b=settleFocus(a,now+1500000),c=settleFocus(b,now+1800000);assert.equal(c.timer.target,900);
 assert.equal(settleFocus(c,now+2700000).timer,null);
});
test('手动提前结束、旧计时兼容、阈值残余补足不循环',()=>{
 let s=base(31);s.focusConfig.planAutoContinue=true;
 const a=startFocusTimer(s,{mode:'focus',minutes:25,taskId:'a',now,planned:true});
 const b=changeFocusTimer(a,{action:'save',key:focusTimerKey(a.timer),now:now+600000,sessionId:'early'});
 assert.equal(b.timer,null);assert.equal(pomodoroPlan(b.tasks[0],b.sessions,b.focusConfig).next,1260);
 const c=changeFocusTimer(a,{action:'save',key:focusTimerKey(a.timer),now:now+1500000,sessionId:'due'});assert.equal(c.timer,null);assert.equal(c.sessions.length,1);
 const tiny={...s,sessions:[{id:'past',taskId:'a',seconds:1850,mode:'focus',startedAt:new Date(now).toISOString()}]};
 const p=pomodoroPlan(tiny.tasks[0],tiny.sessions,tiny.focusConfig);assert.equal(p.unplanned,10);assert.equal(p.next,60);
 const d=startFocusTimer(tiny,{mode:'focus',minutes:25,taskId:'a',now,planned:true});assert.equal(d.timer.target,60);assert.equal(settleFocus(d,now+60000).timer,null);
 assert.equal(migrateState(a).timer.planned,true);
});

import {focusCountOnDay,focusSessionId} from '../src/core/focus-engine.js';
test('跨午夜番茄按启动日归属并正确安排长休息',()=>{
 const start=new Date(2026,10,26,23,59,30).getTime();
 const s=base(10);s.focusConfig={...s.focusConfig,focus:1,cycles:2,planAutoContinue:true};
 s.sessions=[{id:'previous',taskId:'b',mode:'focus',seconds:60,startedAt:new Date(start-3600000).toISOString()}];
 const a=startFocusTimer(s,{mode:'focus',minutes:1,taskId:'a',now:start,planned:true});
 const end=settleFocus(a,start+60000);
 assert.equal(focusCountOnDay(end.sessions,start),2);
 assert.equal(focusCountOnDay(end.sessions,start+60000),0);
 assert.equal(end.timer.mode,'break');assert.equal(end.timer.target,900);
});
test('延迟唤醒不回填下一阶段，显式结束停止普通循环',()=>{
 const s=base(40);s.focusConfig={...s.focusConfig,focus:1,break:1,autoContinue:true};
 const a=startFocusTimer(s,{mode:'focus',minutes:1,taskId:'a',now});
 const late=settleFocus(a,now+119000);
 assert.equal(late.sessions.length,1);assert.equal(late.timer.startedAt,now+119000);
 const onTime=settleFocus(a,now+60000);assert.equal(focusSessionId(late.timer),focusSessionId(onTime.timer));assert.equal(focusTimerKey(late.timer),focusTimerKey(onTime.timer));assert.equal(migrateState(late).timer.phaseAt,onTime.timer.phaseAt);
 assert.equal(settleFocus(late,now+120000),late);
 const end=changeFocusTimer(a,{action:'save',key:focusTimerKey(a.timer),now:now+60000});
 assert.equal(end.timer,null);assert.equal(end.sessions.length,1);
 const discard=changeFocusTimer(a,{action:'discard',key:focusTimerKey(a.timer),now:now+60000});
 assert.equal(discard.timer,null);
 assert.equal(settleFocus({...a,tasks:[]},now+60000).timer,null);
 assert.equal(settleFocus({...a,tasks:a.tasks.map(t=>({...t,status:'completed'}))},now+60000).timer,null);
 assert.equal(settleFocus(a,now+121000).timer,null);
});
