import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,shiftDay} from '../src/core/domain.js';
import {buildReview} from '../src/core/task-review.js';
import {makeVisual,validVisual} from '../src/core/review-visual.js';
import {readGoals,writeGoals,habitAssociation,insightsMarkdown,efficiencySummary} from '../src/core/review-insights.js';
import {saveSnapshot,readSnapshots} from '../src/core/archive-review.js';
import {gestureAxis,gestureAction} from '../src/core/touch-gesture.js';
const date='2026-11-25',store=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)}};
test('回顾效率、匹配偏差、完成日边界与月累计',()=>{
 const d=initialState(),a={...newTask('A','work',date),status:'completed',completedAt:date+'T12:00:00',duration:30},b={...newTask('B','work','2026-11-24'),status:'completed',completedAt:date+'T12:00:00',duration:60},c=newTask('C','work',date),future={...newTask('未来完成','work',date),status:'completed',completedAt:'2026-11-26T12:00:00'};
 d.tasks=[a,b,c,future];d.sessions=[{taskId:a.id,mode:'focus',seconds:2700,startedAt:'2026-11-24T09:00:00'},{taskId:a.id,mode:'break',seconds:600,startedAt:date+'T10:00:00'},{taskId:b.id,mode:'focus',seconds:600,startedAt:'2026-11-26T10:00:00'}];
 const r=buildReview(d,{since:'2026-11-24',until:date}),v=makeVisual(d,r);assert(validVisual(v));assert.equal(v.insights.monthlyCompleted,2);assert.equal(v.insights.yearlyCompleted,2);assert.equal(v.insights.yearlyFocus,45);assert.equal(efficiencySummary(d.tasks,r.since,r.until,'work').completionRate,50);assert.equal(v.insights.monthlyFocus,45);assert.equal(v.insights.completionRate,50);assert.equal(v.insights.onTimeRate,50);assert.equal(v.insights.matched,1);assert.equal(v.insights.bias,15);assert.equal(v.insights.medianError,15);
 const old={...v};delete old.insights;assert(validVisual(old));assert(!validVisual({...v,insights:{...v.insights,onTimeRate:101}}));
 const storage=store();saveSnapshot(storage,r,'week',new Date(),v);d.tasks=[];assert.equal(readSnapshots(storage)[0].visual.insights.matched,1);assert.match(readSnapshots(storage)[0].markdown,/完成效率与计划偏差/);assert.match(insightsMarkdown(v.insights),/不代表因果/);
});
test('习惯关联二元分组、样本门槛、零方差及负相关',()=>{
 const days=Array.from({length:14},(_,i)=>({date:shiftDay(date,i-13),checked:i%2===0}));
 const counts=new Map(days.map(d=>[d.date,d.checked?4:0]));
 const a=habitAssociation(days,counts);assert.equal(a.r,1);assert.equal(a.checkedMean,4);assert.equal(a.uncheckedMean,0);
 assert.equal(habitAssociation(days.slice(0,13),counts).r,null);assert.equal(habitAssociation(days,new Map()).r,null);
 assert.equal(habitAssociation(days,new Map(days.map(d=>[d.date,d.checked?0:4]))).r,-1);
});
test('目标配置本机独立、非法配置不覆盖',()=>{
 const s=store();assert.deepEqual(readGoals(s),{completed:0,focusMinutes:0,yearCompleted:0,yearFocusMinutes:0});writeGoals(s,{completed:100,focusMinutes:3000});assert.throws(()=>writeGoals(s,{completed:-1,focusMinutes:30}));assert.equal(readGoals(s).completed,100);
});
test('手势轴锁定与位移门槛，无破坏性动作',()=>{
 assert.equal(gestureAxis(4,5),null);assert.equal(gestureAxis(-80,20),'x');assert.equal(gestureAxis(-80,60),'y');
 assert.equal(gestureAction(-80,10,'x'),'menu');assert.equal(gestureAction(-80,60,'y'),null);assert.equal(gestureAction(-40,0,'x'),null);
 assert.equal(gestureAction(10,90,'y','sheet'),'dismiss');assert.equal(gestureAction(80,90,'y','sheet'),null);assert.equal(gestureAction(0,-100,'y','sheet'),null);
});
