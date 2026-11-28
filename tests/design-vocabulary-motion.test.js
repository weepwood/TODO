import test from 'node:test';
import assert from 'node:assert/strict';
import {springStep} from '../src/design-system/motion.js';
test('共享指示器弹簧在不等帧间隔下保持相同物理解',()=>{
 const whole=springStep(0,0,100,.2);
 let split={position:0,velocity:0};
 for(const dt of [.012,.031,.043,.014,.05,.05])split=springStep(split.position,split.velocity,100,dt);
 assert.ok(Math.abs(whole.position-split.position)<1e-9);
 assert.ok(Math.abs(whole.velocity-split.velocity)<1e-9);
 assert.ok(whole.position>0&&whole.position<100);
});
test('连续反向保持位置及速度，最终收敛且静止',()=>{
 const prior=springStep(0,0,100,.065),same=springStep(prior.position,prior.velocity,-30,0);
 assert.equal(same.position,prior.position);assert.equal(same.velocity,prior.velocity);
 let state=prior;for(let i=0;i<100;i++)state=springStep(state.position,state.velocity,-30,.016);
 assert.ok(Math.abs(state.position+30)<.001);assert.ok(Math.abs(state.velocity)<.001);
});
