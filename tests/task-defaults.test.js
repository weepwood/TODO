import test from 'node:test';
import assert from 'node:assert/strict';
import {newTask} from '../src/core/domain.js';
import {normalizeTaskDefaults,taskFromCapture,previewPostpone,applyPostpone,taskFocusSummary} from '../src/core/task-defaults.js';
test('清单默认值合法化，明确录入覆盖且无效分组不继承',()=>{
 const list={id:'work',sections:[{id:'s'}]},today='2026-11-25',defaults={priority:2,duration:60,points:5,date:'tomorrow',sectionId:'s'};
 const a=taskFromCapture({parsed:{title:'任务',priority:0},list,today,defaults});
 assert.deepEqual([a.date,a.priority,a.duration,a.points,a.sectionId,a.anchor,a.seriesStart],['2026-11-26',2,60,5,'s',26,'2026-11-26']);
 const b=taskFromCapture({parsed:{title:'任务',date:today,priority:3,points:0},list,today,defaults,sectionId:'missing'});
 assert.deepEqual([b.date,b.priority,b.points,b.sectionId],[today,3,0,null]);
 assert.equal(normalizeTaskDefaults({points:100000,duration:-1}).duration,30);
 assert.equal(normalizeTaskDefaults({points:100000}).points,0);
});
test('延期保留时间差、提醒及积分，排除重复历史并拒绝过期预览',()=>{
 const a={...newTask('a','inbox','2026-11-25'),time:'09:00',points:4,reminderAt:'2026-11-25T08:00'},b={...newTask('b','inbox','2026-11-26'),repeat:'daily'},c={...newTask('c','inbox','2026-11-26'),status:'completed'},d=newTask('d');
 const tasks=[a,b,c,d],p=previewPostpone(tasks,tasks.map(t=>t.id),7);
 assert.equal(p.rows.length,1);assert.equal(p.skipped,3);
 const next=applyPostpone(tasks,p,7);assert.equal(next[0].date,'2026-12-02');assert.equal(next[0].time,a.time);assert.equal(next[0].reminderAt,a.reminderAt);assert.equal(next[0].points,4);assert.equal(next[1],b);
 const changed=[{...a,duration:90},b,c,d];assert.equal(applyPostpone(changed,p,7),changed);
});
test('实际专注仅归属当前实例，排除休息',()=>{
 assert.deepEqual(taskFocusSummary([{taskId:'a',seconds:1800,mode:'focus'},{taskId:'a',seconds:600,mode:'stopwatch'},{taskId:'a',seconds:300,mode:'break'},{taskId:'b',seconds:3600,mode:'focus'}],'a'),{count:2,minutes:40});
});
