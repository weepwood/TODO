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

import {activityPeriod,shiftActivityPeriod,activityChunks,combineActivityReports,activityTrend,activityColor,activityPeriodExample} from '../src/core/activitywatch-summary.js';
test('周期为自然周、月、年，包含闰日并限制未来时间',()=>{
 const now=+new Date('2026-11-29T12:00:00');
 assert.equal(activityPeriod('2026-11-27','week',now).label,'2026-11-23 至 2026-11-29');
 const p=activityPeriod('2024-02-29','year',now);
 assert.equal(p.bounds.length,367);
 assert.equal(activityPeriod('2024-02-29','month',now).bounds.length,30);
 const week=activityPeriod('2026-11-29','week',now);
 assert.equal(week.end,now);assert.equal(week.partial,true);
 assert.equal(shiftActivityPeriod('2024-01-31','month',1),'2024-02-01');
 assert.equal(shiftActivityPeriod('2024-02-29','year',1),'2025-01-01');
 const chunks=activityChunks(p.bounds);
 assert.equal(chunks.length,53);assert(chunks.every(c=>c.length<=8));
 assert.deepEqual(chunks.flatMap((c,i)=>i?c.slice(1):c),p.bounds);
});
test('周期汇总和筛选不重复计入网站，缺失日期保持未知',()=>{
 const p=activityPeriod('2024-02-29','month',+new Date('2026-11-29T12:00:00')),r=activityPeriodExample(p);
 assert.equal(r.days.length,29);assert.equal(r.days.filter(d=>!d.known_ms).length,4);
 assert.equal(r.active_ms,25*5.5*3600000);assert.equal(r.website_ms,25*1.5*3600000);
 assert.equal(r.timeline.length,0);
 const t=activityTrend(r,'month','websites','github.com');
 assert.equal(t.filter(d=>!d.available).length,4);assert.equal(t.reduce((s,d)=>s+d.ms,0),25*3600000);
 assert.equal(activityTrend(activityPeriodExample(activityPeriod('2024-01-01','year',Date.now())),'year','apps','').length,12);
 assert.equal(activityColor('VS Code'),activityColor('VS Code'));
 assert.throws(()=>combineActivityReports([{...r,days:r.days.slice(1)}],p),/不完整/);
});

import {readActivityPeriod} from '../src/core/activitywatch-summary.js';
import {execFileSync} from 'node:child_process';
test('分段查询仅使用授权范围，取消或失败不继续请求、不返回部分结果',async()=>{
 const p=activityPeriod('2024-02-29','month',Date.now()),calls=[],progress=[];
 const fixture=activityPeriodExample(p);
 const load=async args=>{calls.push(args);return {days:fixture.days.filter(d=>d.start>=args.start&&d.end<=args.end),warnings:[]}};
 const r=await readActivityPeriod(p,'month',load,()=>true,(...x)=>progress.push(x));
 assert.equal(calls.length,5);assert(calls.every(x=>x.consent&&x.detail===false));
 assert.deepEqual(calls.flatMap((c,i)=>i?c.bounds.slice(1):c.bounds),p.bounds);
 assert.equal(r.active_ms,fixture.active_ms);assert.deepEqual(progress.at(-1),[5,5]);
 let current=true,count=0;
 assert.equal(await readActivityPeriod(p,'month',async x=>{count++;current=false;return load(x)},()=>current),null);
 assert.equal(count,1);
 count=0;
 await assert.rejects(readActivityPeriod(p,'month',async x=>{count++;if(count===2)throw Error('offline');return load(x)}),/offline/);
 assert.equal(count,2);
 count=0;
 await assert.rejects(readActivityPeriod(p,'month',async()=>{count++;return {days:[]}}),/不完整/);
 assert.equal(count,1);
});
test('夏令时春季23小时与秋季25小时保持本地日期边界',()=>{
 const code=`import {activityPeriod} from './src/core/activitywatch-summary.js';console.log(JSON.stringify(['2024-03-10','2024-11-03'].map(d=>{const p=activityPeriod(d,'day',Date.now());return (p.end-p.start)/3600000})))`;
 const result=execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:new URL('..',import.meta.url),env:{...process.env,TZ:'America/New_York'},encoding:'utf8'});
 assert.deepEqual(JSON.parse(result),[23,25]);
});
