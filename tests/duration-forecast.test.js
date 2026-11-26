import test from 'node:test';
import assert from 'node:assert/strict';
import {durationSamples,durationForecast,durationDiagnostics} from '../src/core/duration-forecast.js';
import {shiftDay} from '../src/core/domain.js';
const today='2026-11-26';
test('时长样本排除无效、休息、未来及完成后记录，保留清单范围',()=>{
 const t={id:'a',status:'completed',listId:'work',duration:30,completedAt:today+'T12:00:00'};
 const s={taskId:'a',mode:'focus',seconds:3600,startedAt:today+'T09:00:00'};
 const data={tasks:[t,{...t,id:'b',deletedAt:today}],sessions:[s,{...s,mode:'break'},{...s,startedAt:today+'T11:30:00'},{...s,startedAt:'2026-11-27T09:00:00'},{...s,taskId:'b'}]};
 assert.equal(durationSamples(data,today)[0].actual,60);assert.equal(durationSamples(data,today,'other').length,0);
});
test('预测样本门槛、经验分位数、时间回测及基线',()=>{
 const rows=Array.from({length:12},(_,i)=>({date:shiftDay(today,i-11),estimate:30,actual:60}));
 assert.equal(durationForecast(rows.slice(0,9),30),null);
 assert.deepEqual(durationForecast(rows,20),{count:12,median:40,low:40,high:40});
 const d=durationDiagnostics(rows);assert.equal(d.evaluated,2);assert.equal(d.coverage,100);assert.equal(d.mae,0);assert.equal(d.baselineMae,30);
 assert.equal(durationDiagnostics(rows.map(r=>({...r,date:today}))).evaluated,0);
});

test('正向计时与番茄钟均纳入，预测采用最近500项',()=>{
 const task={id:'a',status:'completed',duration:30,completedAt:today+'T12:00:00'};
 const data={tasks:[task],sessions:[{taskId:'a',mode:'stopwatch',seconds:600,startedAt:today+'T09:00:00'},{taskId:'a',mode:'focus',seconds:1200,startedAt:today+'T10:00:00'}]};
 assert.equal(durationSamples(data,today)[0].actual,30);
 const samples=[...Array.from({length:501},()=>({actual:1,estimate:30})),...Array.from({length:500},()=>({actual:60,estimate:30}))];
 assert.equal(durationForecast(samples,30).median,60);assert.equal(durationForecast(samples,30).count,500);
});
