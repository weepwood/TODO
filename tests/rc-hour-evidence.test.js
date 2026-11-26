import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyHour} from '../scripts/verify-rc-hour.mjs';
const expected='a'.repeat(40);
const samples=[{cycle:0,elapsedMs:30,usedSize:100,totalSize:200,domNodes:10},{cycle:100,elapsedMs:3600001,usedSize:110,totalSize:200,domNodes:10}];
const final={tasks:10000,cycles:100,added:101,switches:202,saved:10101,elapsedMs:3600010,samples,errors:[]};
const evidence={expected,commit:expected,exitCode:0,progress:{complete:true,...final},final};
test('小时级证据仅最终一致且成功退出才通过工作负载验收',()=>{
 assert.equal(verifyHour(evidence).status,'passed-workload');
 assert.equal(verifyHour({...evidence,exitCode:null}).status,'incomplete');
 assert.equal(verifyHour({...evidence,exitCode:1}).status,'failed');
 assert.equal(verifyHour({...evidence,final:null}).status,'failed');
 assert.equal(verifyHour({...evidence,final:null,progress:{complete:false,elapsedMs:100,rounds:0,samples:samples.slice(0,1),errors:[]},exitCode:null}).status,'incomplete');
 assert.equal(verifyHour({...evidence,commit:'b'.repeat(40)}).status,'failed');
});
test('运行时长、持久化计数、采样顺序及异常均不能伪造通过',()=>{
 for(const patch of [{elapsedMs:3599999},{saved:10000},{errors:['page error']},{samples:[...samples].reverse()},{samples:[samples[0],{...samples[1],elapsedMs:3500000}]}]){
  const bad={...final,...patch};assert.equal(verifyHour({...evidence,final:bad,progress:{complete:true,...bad}}).status,'failed');
 }
 assert.equal(verifyHour({...evidence,progress:{...evidence.progress,saved:0}}).status,'failed');
});
