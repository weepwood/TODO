import test from 'node:test';
import assert from 'node:assert/strict';
import {newTask,initialState} from '../src/core/domain.js';
import {executionPlan,planningCandidate,calendarBusy} from '../src/core/productivity.js';
import {defaultWeek,previewWeekReflow} from '../src/core/weekly-planner.js';
import {previewReflow,applyReflow} from '../src/core/planner-interaction.js';
import {taskConflicts} from '../src/core/advanced.js';
import {blockMinutes,expandPlanBlocks} from '../src/core/plan-block.js';
import {durationSamples,planningEvidence} from '../src/core/duration-forecast.js';
const date='2026-11-27',at=t=>Date.parse(date+'T'+t),mk=(id,fields={})=>({...newTask(id,'inbox','',id),createdAt:'2026-11-26T00:00:00Z',...fields});
const fixed=mk('fixed',{date,time:'10:00',duration:30,planLocked:true});
const opts={start:'09:00',end:'11:15',remainingBlocks:true,includeBacklog:true};
const apply=(tasks,plan)=>tasks.map(t=>({...t,...plan.placements.find(p=>p.id===t.id)}));
test('局部修复保持原任务集合并解决105分钟碎片夹具',()=>{
 const tasks=[fixed,mk('A',{duration:45,priority:3,deadline:date+'T11:15'}),mk('B',{duration:60,priority:2,deadline:date+'T11:15'})];
 const before=JSON.stringify(tasks),base=executionPlan(tasks,date,{...opts,optimize:false}),r=executionPlan(tasks,date,opts);
 assert.deepEqual(base.placements.map(p=>p.id),['A']);assert.deepEqual(r.placements.map(p=>[p.id,p.time]),[['B','09:00'],['A','10:30']]);
 assert.equal(taskConflicts(apply(tasks,r)).size,0);assert.equal(r.capacity[0].remaining,0);assert.equal(JSON.stringify(tasks),before);
});
test('独立穷举256个双窗口四任务夹具：不丢弃基线已安排任务，不超过最优',()=>{
 let improved=0,baseOptimal=0,optimizedOptimal=0,baseCount=0,optimizedCount=0,oracleCount=0;
 function oracle(ds,i=0,a=60,b=45){if(i===ds.length)return 0;const n=ds[i];return Math.max(oracle(ds,i+1,a,b),a>=n?1+oracle(ds,i+1,a-n,b):0,b>=n?1+oracle(ds,i+1,a,b-n):0)}
 for(let v=0;v<256;v++){
  const ds=Array.from({length:4},(_,i)=>15*(1+(v>>2*i&3))),tasks=[fixed,...ds.map((duration,i)=>mk('t'+i,{duration,priority:3-i,deadline:date+'T11:15'}))];
  const a=executionPlan(tasks,date,{...opts,optimize:false}),b=executionPlan(tasks,date,opts),n=oracle(ds);
  const ids=new Set(b.placements.map(p=>p.id));assert(a.placements.every(p=>ids.has(p.id)));assert(b.placements.length<=n);assert.equal(taskConflicts(apply(tasks,b)).size,0);
  for(const p of b.placements)assert(at(p.time)+p.planMinutes*60000<=at('11:15'));
  assert(b.optimization.trials<=24);improved+=Number(b.placements.length>a.placements.length);baseOptimal+=Number(a.placements.length===n);optimizedOptimal+=Number(b.placements.length===n);baseCount+=a.placements.length;optimizedCount+=b.placements.length;oracleCount+=n;
 }
 console.log('ORACLE',JSON.stringify({cases:256,improved,baseOptimal,optimizedOptimal,baseCount,optimizedCount,oracleCount}));
 assert(improved>0);assert(optimizedOptimal>=baseOptimal);
});
test('工作周、实时下界、预留及跨日占位严格一致',()=>{
 const week=defaultWeek().map(d=>({...d,start:'09:00',end:'10:00'})),t=mk('large',{duration:150,date});
 const r=executionPlan([t],date,{...opts,week,splitDays:7,remainingBlocks:false,notBefore:at('09:00'),reserve:0}),p=r.placements[0];
 assert.equal(p.planMinutes,60);assert.deepEqual(p.planSegments.map(s=>[s.date,s.minutes]),[['2026-11-30',60],['2026-12-01',30]]);
 assert.equal(expandPlanBlocks(apply([t],r)).reduce((n,t)=>n+blockMinutes(t),0),150);
 assert.equal(executionPlan([t],date,{...opts,week,splitDays:3}).placements.length,0);
 const q=executionPlan([mk('a',{duration:20}),mk('b',{duration:20})],date,{...opts,week,notBefore:at('09:10:01'),reserve:20});
 assert.equal(q.placements[0].time,'09:11');assert.equal(q.capacity[0].usable,49);assert.equal(q.capacity[0].reserved,10);assert.equal(q.placements.length,1);
 assert.equal(executionPlan([t],date,{...opts,notBefore:at('12:00')}).placements.length,0);
});
test('严格截止、积压候选、依赖剩余与正在执行保护',()=>{
 const a=mk('a',{duration:90,deadline:date+'T09:30'}),b=mk('b',{duration:30,dependsOn:['a']}),c=mk('c',{duration:15,dependsOn:['a','b']}),old=mk('old',{date:'2026-11-26',duration:15}),live=mk('live',{duration:10});
 const r=executionPlan([a,b,c,old,live],date,{...opts,activeTaskId:'live'});
 assert(planningCandidate(old,date,true));assert(!planningCandidate(old,date,false));assert.deepEqual(r.placements.map(p=>p.id),['old']);
 assert.equal(r.skipped.find(p=>p.id==='a').gapMinutes,60);assert.equal(r.skipped.find(p=>p.id==='c').blockingCount,2);assert.equal(r.skipped.find(p=>p.id==='c').prerequisiteMinutes,120);assert.match(r.skipped.find(p=>p.id==='live').reason,/执行/);
});
test('跨秒外部日历和剩余专注不产生占位冲突',()=>{
 const busy=calendarBusy([{id:'e',title:'e',start:date+'T09:00:30',end:date+'T09:30:30'}]),t=mk('a',{duration:60,planMinutes:120});
 const r=executionPlan([...busy,t],date,{...opts,sessions:[{taskId:'a',mode:'focus',seconds:1800}]});
 assert.equal(r.placements[0].time,'09:31');assert.equal(r.placements[0].planMinutes,30);assert.equal(taskConflicts(apply([...busy,t],r)).size,0);
});
test('滚动重排保留最近时间、锁定及无冲突任务，过期确认拒绝',()=>{
 const lock=mk('lock',{date,time:'12:00',duration:30,planLocked:true}),move=mk('move',{date,time:'12:15',duration:30}),safe=mk('safe',{date,time:'14:00',duration:30}),data={...initialState(),tasks:[lock,move,safe]};
 const r=previewReflow(data,date,'09:00','18:00',{notBefore:at('11:45')});
 assert.deepEqual(r.map(p=>[p.id,p.to]),[['move','12:30']]);const n=applyReflow(data,date,'09:00','18:00',r,{notBefore:at('11:45')});assert.equal(n.tasks[0],lock);assert.equal(n.tasks[2],safe);
 assert.equal(applyReflow(data,date,'09:00','18:00',r,{notBefore:at('12:45')}),data);
 assert.deepEqual(previewReflow({...data,timer:{taskId:'move'}},date,'09:00','18:00'),[]);
 const week=defaultWeek();assert.equal(previewWeekReflow(data,date,week,3,{notBefore:at('12:45')})[0].to,'12:45');
});
test('原预计、原截止和人工修改记录的限定复核，重叠和不一致样本拒绝',()=>{
 const local=t=>new Date(date+'T'+t).toISOString(),created=local('08:00'),done=local('12:00'),first=local('09:00');
 const event=(id,kind,at,changes=[],source='manual')=>({id,kind,at,source,operation:id,changes});
 const t={...mk('a',{duration:60,deadline:date+'T13:00',status:'completed',createdAt:created,completedAt:done}),activity:[event('1','created',created),event('2','updated',local('10:00'),[{field:'duration',before:'30',after:'60'},{field:'deadline',before:date+'T09:00',after:date+'T13:00'},{field:'date',before:'未设置',after:date}]),event('3','completed',done)]};
 // Use local wall time for deadline expectations regardless of test timezone.
 t.deadline=date+'T23:59';t.activity[1].changes[1].after=t.deadline;t.activity[1].changes[1].before='2026-11-26';
 const data={tasks:[t],sessions:[{taskId:'a',mode:'focus',seconds:1800,startedAt:first}]};
 const a=planningEvidence(data,date);assert.equal(a.count,1);assert.equal(a.samples[0].estimate,30);assert.equal(a.deadlineTotal,1);assert.equal(a.deadlineMet,0);assert.equal(a.adjustmentRecords,1);
 assert.equal(planningEvidence({...data,tasks:[{...t,activity:[]}]},date).count,0);
 assert.equal(durationSamples({...data,sessions:[...data.sessions,{...data.sessions[0]}]},date).length,0);
 assert.equal(planningEvidence({...data,tasks:[{...t,duration:90}]},date).count,0);
});
