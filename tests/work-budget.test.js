import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workBudget} from '../src/productivity.js';
test('工作时间预算裁剪、重叠合并及空闲窗口',()=>{
 assert.deepEqual(workBudget([{time:'08:00',endTime:'10:00'},{time:'09:30',endTime:'11:00',external:true},{time:'17:30',endTime:'24:00'},{time:'12:00',endTime:'12:30'}],'09:00','18:00'),{capacity:540,occupied:180,remaining:360,free:[[660,720],[750,1050]]});
 assert.deepEqual(workBudget([],'09:00','18:00'),{capacity:540,occupied:0,remaining:540,free:[[540,1080]]});
 assert.equal(workBudget([],'18:00','09:00'),null);
});
