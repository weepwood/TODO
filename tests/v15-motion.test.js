import test from 'node:test';
import assert from 'node:assert/strict';
import {gestureAxis,gestureAction,gestureOffset} from '../src/core/touch-gesture.js';
test('手势跟手在初始区间一比一，远距离单调且有上限',()=>{
 for(const [kind,axis,sign,knee] of [['row','x',-1,48],['detail','x',1,120],['sheet','y',1,100]]){
  const value=n=>gestureOffset(axis==='x'?sign*n:0,axis==='y'?n:0,axis,kind)*sign;
  assert.equal(value(20),20);assert.equal(value(knee),knee);assert(value(knee*2)>knee);assert(value(1e6)<=knee*1.65+1e-9);assert(value(300)<=value(500));
 }
 assert.equal(gestureOffset(-80,0,'y','row'),0);assert.equal(gestureOffset(80,0,'x','row'),0);assert.equal(gestureOffset(0,-100,'y','sheet'),0);
});
test('回弹与动作阈值相互独立，短拖动、反向和斜向不提交动作',()=>{
 assert(gestureOffset(-45,0,'x','row')<0);assert.equal(gestureAction(-45,0,'x'),null);
 assert.equal(gestureAction(65,0,'x','detail'),null);assert.equal(gestureAction(75,10,'x','detail'),'dismiss');
 assert.equal(gestureAction(0,60,'y','sheet'),null);assert.equal(gestureAction(35,73,'y','sheet'),null);assert.equal(gestureAxis(20,30),'y');
});
