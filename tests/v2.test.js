import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState,completeTask,reconcile,dayKey,effectiveDay,nextDate,matches,saveState,STORAGE_KEY,BACKUP_KEY,reopenTask,reorderTasks,dueReminders,timerSeconds} from '../src/domain.js';
test('兼容旧版任务并保留数据',()=>{const t=newTask('历史任务','work','2026-11-25');const s=initialState();const v=migrateState({version:1,theme:'light',lists:s.lists.map(({id,name,color})=>({id,name,color})),tasks:[t]});assert.equal(v.version,2);assert.equal(v.tasks[0].id,t.id);assert.deepEqual(v.tasks[0].tags,[]);assert.equal(v.lists[1].sections.length,0)});
test('拒绝异常日期、重复 ID 和无效锚点',()=>{const d=initialState();const t=newTask('任务','inbox','2026-11-25');assert.throws(()=>migrateState({...d,tasks:[{...t,date:'2026-02-30'}]}));assert.throws(()=>migrateState({...d,tasks:[t,t]}));assert.throws(()=>migrateState({...d,tasks:[{...t,anchor:99}]}))});
test('完成后间隔以实际完成日期为基准',()=>{const t={...newTask('维护','work','2026-11-01'),repeat:'completion',interval:3};const out=completeTask([t],t.id,'2026-11-25');assert.equal(out[1].date,'2026-11-28');assert.equal(out[1].previousId,t.id)});
test('自定义周期间隔与月末锚点',()=>{assert.equal(nextDate('2026-11-25','weekly',25,2),'2026-12-09');assert.equal(nextDate('2024-01-31','monthly',31,2),'2024-03-31')});
test('每日重置边界与跳过',()=>{const t={...newTask('日常','inbox','2026-11-24'),repeat:'daily',miss:'skip',reset:'04:00'};const before=new Date(2026,10,25,3,59),after=new Date(2026,10,25,4,0);assert.equal(effectiveDay(before,'04:00'),'2026-11-24');assert.equal(reconcile([t],dayKey(before),before).length,1);assert.equal(reconcile([t],dayKey(after),after)[1].date,'2026-11-25')});
test('回收站隔离与重复历史保护',()=>{const t={...newTask('日常','inbox','2026-11-25'),repeat:'daily'};assert.equal(matches({...t,deletedAt:'now'},'trash'),true);assert.equal(matches({...t,deletedAt:'now'},'all'),false);const completed=completeTask([t],t.id,'2026-11-25');assert.equal(reopenTask(completed,t.id),completed)});
test('持久化备份保留上一版本',()=>{const m=new Map();const storage={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};const d=initialState();saveState(storage,d);saveState(storage,{...d,theme:'dark'});assert.equal(JSON.parse(m.get(BACKUP_KEY)).theme,'system');assert.equal(JSON.parse(m.get(STORAGE_KEY)).theme,'dark')});
test('提醒独立于计划日期、计时恢复、排序',()=>{const t={...newTask('提醒','inbox','2026-12-01'),reminderAt:'2026-11-25T08:00'};assert.equal(dueReminders([t],new Date(2026,10,25,9)).length,1);assert.equal(dueReminders([{...t,remindedAt:'done'}],new Date(2026,10,25,9)).length,0);assert.equal(timerSeconds({elapsed:10,startedAt:1000},6000),15);const other=newTask('另一个');assert.equal(reorderTasks([t,other],other.id,t.id)[0].id,other.id)});

test('同日后续重复实例也禁止直接恢复历史，避免并行实例',()=>{
 const t={...newTask('同日重复','inbox','2026-11-25'),status:'completed',repeat:'completion',occurrenceIndex:1};
 const later={...newTask('同日重复','inbox',t.date),seriesId:t.id,previousId:t.id,occurrenceIndex:2};
 const rows=[t,later];
 assert.equal(reopenTask(rows,t.id),rows);
});
