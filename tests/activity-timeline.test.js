import test from 'node:test';
import assert from 'node:assert/strict';
import {activityTimeline,seriesTimeline,groupTimeline} from '../src/core/activity-timeline.js';
test('活动时间线保留真实事件并按实际时间排序',()=>{
 const task={createdAt:'2026-11-24T23:30:00Z',completedAt:'2026-11-25T03:00:00Z',deletedAt:'2026-11-26T03:00:00Z',previousId:'prev'};
 const events=activityTimeline(task);
 assert.deepEqual(events.map(e=>e.kind),['deleted','completed','created','generated']);
 assert.equal(events[0].dateTime,'2026-11-26T03:00:00.000Z');
 assert.equal(groupTimeline(events).flatMap(g=>g.items).length,4);
 assert.equal(activityTimeline({createdAt:'bad'})[0].day,'');
});
test('系列时间线按计划日期排序，不冒充实际完成时间或修改原始任务',()=>{
 const root={id:'a',date:'2026-11-24',status:'completed',occurrenceIndex:1};
 const current={id:'b',seriesId:'a',date:'2026-11-25',status:'pending',occurrenceIndex:2};
 const next={id:'c',seriesId:'a',date:'2026-11-26',status:'skipped',occurrenceIndex:3};
 const other={id:'x',date:'2026-11-27',status:'pending'};
 const tasks=[root,current,next,other],before=JSON.stringify(tasks);
 assert.deepEqual(seriesTimeline(tasks,current).map(e=>[e.id,e.day,e.kind]),[['c','2026-11-26','skipped'],['a','2026-11-24','completed']]);
 assert.equal(JSON.stringify(tasks),before);
});
