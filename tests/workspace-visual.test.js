import test from 'node:test';
import assert from 'node:assert/strict';
import {eventColor,heatmapCells,groupFocusRecords} from '../src/core/workspace-visual.js';
import {dayKey} from '../src/core/domain.js';
test('日历与规划事件颜色统一，外部日程保持独立颜色',()=>{
 assert.equal(eventColor('#FF55aa'),'#FF55aa');
 assert.equal(eventColor('invalid'),'#5276d6');
 assert.equal(eventColor('#ff0000',true),'#8d93a4');
});
test('364天热力图使用本地日期、真实星期、稳定列位置和明确分级',()=>{
 const cells=heatmapCells('2026-11-25',{'2026-11-25':7,'2026-11-24':1});
 assert.equal(cells.length,364);
 assert.equal(cells.at(-1).date,'2026-11-25');
 assert.equal(cells.at(-1).row,4);
 assert.equal(cells.at(-1).level,4);
 assert.equal(cells.at(-1).count,7);
 assert.equal(cells.at(-2).level,1);
 assert.equal(new Set(cells.map(c=>c.row+':'+c.column)).size,364);
 assert(cells.every(c=>c.row===new Date(c.date+'T12:00:00').getDay()+1));
});
test('专注历史分组不修改源记录，保留最近记录上限和时长总计',()=>{
 const rows=[{id:'a',startedAt:'2026-11-23T12:00:00',seconds:60},{id:'b',startedAt:'2026-11-24T11:00:00',seconds:120},{id:'c',startedAt:'2026-11-24T12:00:00',seconds:180}];
 const result=groupFocusRecords(rows,dayKey,2);
 assert.equal(result.length,1);assert.equal(result[0].seconds,300);
 assert.deepEqual(result[0].records.map(r=>r.id),['c','b']);
 assert.deepEqual(rows.map(r=>r.id),['a','b','c']);
});
