import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState,dayKey,shiftDay,reopenTask} from '../src/domain.js';
import {summarizePoints} from '../src/points.js';
import {emptyProgram,validPointsProgram,setGoals,saveReward,archiveReward,pointsWallet,redeemReward,refundReward,goalProgress,cumulativePoints} from '../src/points-program.js';
import {mergeTasks} from '../src/sync-merge.js';
const today='2026-11-25',at=new Date(today+'T12:00:00').toISOString(),later=new Date(today+'T13:00:00').toISOString();
const task=(points,day=today)=>({...newTask('测试任务'),points,status:'completed',stage:'done',completedAt:new Date(day+'T09:00:00').toISOString()});
function fixture(){return saveReward({...initialState(),tasks:[task(100),task(-10)]},{id:'reward',name:'看电影',cost:60})}
test('自然周期净积分目标：周一起算、月首、负数及期初累计',()=>{
 const tasks=[task(10),task(-3),task(20,'2026-11-23'),task(7,'2026-11-22'),task(8,'2026-10-31'),task(99,'2026-11-26')];
 const goals=goalProgress(tasks,today,{daily:10,weekly:30,monthly:40});
 assert.deepEqual(goals.map(g=>[g.since,g.net]),[[today,7],['2026-11-23',27],['2026-11-01',34]]);
 const stats=summarizePoints(tasks,{since:'2026-11-23',today});assert.deepEqual(cumulativePoints(stats,['2026-11-23','2026-11-24',today]).map(p=>p.net),[15,35,35,42]);
});
test('兑换余额、幂等、改价与归档保护、退款历史独立',()=>{
 let s=fixture();assert.deepEqual(pointsWallet(s,today),{earned:90,spent:0,balance:90});
 const old=s;assert.equal(redeemReward(s,'reward','bad',at,today,50),s);
 s=redeemReward(s,'reward','r1',at,today,60);assert.deepEqual(pointsWallet(s,today),{earned:90,spent:60,balance:30});
 assert.equal(redeemReward(s,'reward','r1',at,today,60),s);assert.equal(redeemReward(s,'reward','r2',at,today,60),s);
 s=saveReward(s,{id:'reward',name:'新奖励',cost:10});assert.equal(s.pointsProgram.redemptions[0].name,'看电影');assert.equal(s.pointsProgram.redemptions[0].cost,60);
 s=archiveReward(s,'reward',true);assert.equal(redeemReward(s,'reward','r2',at,today,10),s);
 s=refundReward(s,'r1',later);assert.equal(pointsWallet(s,today).balance,90);assert.equal(refundReward(s,'r1',later),s);assert.equal(s.pointsProgram.redemptions[0].refundedAt,later);
 assert.equal(old.pointsProgram.redemptions.length,0);assert.deepEqual(migrateState(s),s);
});
test('撤销任务导致负余额仍保留消费记录，冲突不自动合并兑换',()=>{
 const base=fixture(),s=redeemReward(base,'reward','r1',at,today,60);
 const removed={...s,tasks:reopenTask(s.tasks,s.tasks[0].id)};
 assert.deepEqual(pointsWallet(removed,today),{earned:-10,spent:60,balance:-70});
 assert.equal(redeemReward(removed,'reward','r2',at,today,60),removed);
 const remote=redeemReward(base,'reward','r2',at,today,60);
 assert.equal(mergeTasks(base,s,remote),null);
});
test('旧数据不迁移写入，非法积分计划与重复记录拒绝',()=>{
 const old=initialState();assert.deepEqual(migrateState(old),old);
 const s=setGoals(old,{daily:10,weekly:50,monthly:200});assert.deepEqual(migrateState(s),s);
 assert.equal(setGoals(s,{daily:-1,weekly:50,monthly:200}),s);
 assert.equal(saveReward(s,{id:'bad',name:'',cost:10}),s);
 assert.equal(saveReward(s,{id:'bad',name:'测试',cost:-1}),s);
 for(const p of [null,{...emptyProgram(),goals:{daily:1,weekly:2,monthly:1.5}},{...emptyProgram(),rewards:[{id:'r',name:'a',cost:0,archived:false}]}])assert.throws(()=>migrateState({...old,pointsProgram:p}),/积分/);
 const redeemed=redeemReward(fixture(),'reward','r1',at,today,60);
 assert.equal(validPointsProgram({...redeemed.pointsProgram,redemptions:[...redeemed.pointsProgram.redemptions,...redeemed.pointsProgram.redemptions]}),false);
});
