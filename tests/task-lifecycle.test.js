import test from 'node:test';
import assert from 'node:assert/strict';
import {newTask,completeTask} from '../src/core/domain.js';
import {seriesOverview,taskSuggestions,closeoutPreview,applyCloseout} from '../src/core/task-lifecycle.js';
const today='2026-11-25';
test('系列预览与生成一致，结束次数及完成后规则明确',()=>{
 const a={...newTask('日常','inbox',today),repeat:'daily',repeatCount:2};
 const r=seriesOverview([a],a.id,today);
 assert.deepEqual(r.next,{date:'2026-11-26',index:2,conditional:false});
 const after=completeTask([a],a.id,today);
 assert.equal(after.length,2);
 assert.equal(after[1].date,r.next.date);
 const end=seriesOverview(after,a.id,today);
 assert.equal(end.completed,1);assert.equal(end.next,null);
 assert.equal(end.reason,'已达到重复结束条件');
 const completion={...a,repeat:'completion',date:'2026-11-20'};
 assert.equal(seriesOverview([completion],completion.id,today).next.conditional,true);
 assert.equal(seriesOverview([completion],completion.id,today).next.date,'2026-11-26');
});
test('建议按实际日期和依赖分类，不将历史及删除计入',()=>{
 const a={...newTask('旧任务','inbox'),createdAt:'2026-11-01T12:00:00'},b={...newTask('过期','inbox','2026-11-24')},c={...newTask('已完成'),status:'completed'},d={...newTask('可开始'),dependsOn:[c.id]},e={...newTask('等待'),dependsOn:[b.id]},f={...a,id:'deleted',deletedAt:today};
 const groups=taskSuggestions([a,b,c,d,e,f],today);
 assert.deepEqual(groups.unscheduled.map(x=>x.task.id),[a.id]);assert.deepEqual(groups.overdue.map(x=>x.task.id),[b.id]);assert.deepEqual(groups.ready.map(x=>x.task.id),[d.id]);assert.deepEqual(groups.blocked.map(x=>x.task.id),[e.id]);
});
test('每日收尾仅移动所选普通待办，保留提醒积分并拒绝过期回执',()=>{
 const a={...newTask('a','inbox','2026-11-24'),time:'09:00',points:5,reminderAt:'2026-11-24T08:00'},b={...newTask('b','inbox',today),repeat:'daily'},c=newTask('c','inbox',today),d=newTask('d','inbox','2026-11-26');
 const tasks=[a,b,c,d],rows=closeoutPreview(tasks,[a.id,b.id,d.id],today);
 assert.equal(rows.length,1);
 const next=applyCloseout(tasks,rows,today);assert.equal(next[0].date,'2026-11-26');assert.equal(next[0].reminderAt,a.reminderAt);assert.equal(next[0].points,5);assert.equal(next[1],b);assert.equal(next[2],c);
 const changed=[{...a,status:'completed'},b,c,d];assert.equal(applyCloseout(changed,rows,today),changed);
});
