import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDate,shiftDay,newTask,completeTask,reconcile,matches} from '../src/domain.js';
test('月末锚点与闰年',()=>{assert.equal(nextDate('2024-01-31','monthly',31),'2024-02-29');assert.equal(nextDate('2024-02-29','monthly',31),'2024-03-31');assert.equal(shiftDay('2026-12-31',1),'2027-01-01')});
test('重复任务完成后产生独立实例且幂等',()=>{const t={...newTask('日常','inbox','2026-11-25'),repeat:'daily'};const a=completeTask([t],t.id,'2026-11-25');assert.equal(a.length,2);assert.equal(a[0].status,'completed');assert.equal(a[1].date,'2026-11-26');assert.equal(completeTask(a,t.id).length,2)});
test('跳过过期实例并补齐当前周期',()=>{const t={...newTask('日常','inbox','2026-11-20'),repeat:'daily',miss:'skip'};const a=reconcile([t],'2026-11-25');assert.equal(a[0].status,'skipped');assert.equal(a[1].date,'2026-11-25');assert.equal(reconcile(a,'2026-11-25').length,2);assert.equal(matches(a[0],'today','2026-11-25'),false);assert.equal(matches(a[1],'today','2026-11-25'),true)});
test('智能清单边界',()=>{const t=newTask('任务','inbox','2026-12-02');assert.equal(matches(t,'upcoming','2026-11-25'),true);assert.equal(matches({...t,date:'2026-12-03'},'upcoming','2026-11-25'),false);assert.equal(matches({...t,date:''},'today','2026-11-25'),false)});
