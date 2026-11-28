import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityDayRange,activityTaskComparison,unionIntervals,activityExample} from '../src/core/activitywatch-summary.js';
test('日期拒绝非法或未来日期，并裁剪今天到当前时刻',()=>{
 const now=+new Date('2026-11-28T12:00:00');
 assert.equal(activityDayRange('2026-02-30',now),null);
 assert.equal(activityDayRange('2026-11-29',now),null);
 assert.deepEqual(activityDayRange('2026-11-28',now),{start:+new Date('2026-11-28T00:00:00'),end:now});
});
test('合成任务规划、专注和活动交集保持独立，数据不变',()=>{
 const day='2026-11-27',x=activityExample(day),snapshot=JSON.stringify(x);
 const rows=activityTaskComparison(x.data,x.report,day),h=3600000;
 assert.deepEqual(rows.map(t=>[t.estimate,t.plan,t.focus,t.focusOverlap,t.planOverlap]),[[2*h,2*h,1.5*h,1.5*h,2*h],[1.5*h,1.5*h,h,h,1.5*h]]);
 assert.equal(JSON.stringify(x),snapshot);
});
test('重叠专注去重、跨日裁剪、排除休息及无效日期',()=>{
 const start=+new Date('2026-11-27T00:00:00'),end=start+3600000;
 const report={start,end,timeline:[{start,end,subject:'Editor'}]};
 const data={tasks:[{id:'a',title:'A',duration:60,date:'2026-11-27',time:'00:00',planSegments:[{id:'s',date:'2026-11-27',time:'00:30',minutes:30}]},{id:'b',title:'B',duration:30,date:'2026-11-27',time:'bad'}],sessions:[{taskId:'a',mode:'focus',startedAt:new Date(start-60000).toISOString(),seconds:1860},{taskId:'a',mode:'focus',startedAt:new Date(start+900000).toISOString(),seconds:2700},{taskId:'a',mode:'break',startedAt:new Date(start).toISOString(),seconds:600}]};
 const [a,b]=activityTaskComparison(data,report,'2026-11-27');
 assert.equal(a.focus,3600000);assert.equal(a.plan,3600000);assert.equal(a.focusOverlap,3600000);assert.equal(a.planOverlap,3600000);assert.equal(b.plan,0);
 assert.deepEqual(unionIntervals([[0,2],[1,3],[6,9],[8,10],[NaN,10]]),[[0,3],[6,10]]);
});
