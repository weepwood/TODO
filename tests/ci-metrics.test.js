import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregate} from '../scripts/ci-metrics.mjs';
import {hasFullGate} from '../scripts/require-full-ui.mjs';
const sha='a'.repeat(40),m=(i,extra={})=>({sha,mode:'full',shard:i,shards:2,passed:1,skipped:1,failed:0,flaky:0,durationMs:i*100,ids:['p'+i,'s'+i],expectedIds:['p1','s1','p2','s2'],...extra});
test('aggregate requires exact candidate, disjoint shards, full success and count identity',()=>{
 assert.deepEqual(aggregate([m(1),m(2)],sha,2),{sha,shards:2,passed:2,skipped:2,failed:0,flaky:0,tests:4,browserRunnerMs:300,browserCriticalPathMs:200});
 for(const bad of [[m(1)], [m(1),m(1)], [m(1),m(2,{sha:'b'.repeat(40)})],[m(1),m(2,{mode:'targeted'})],[m(1),m(2,{failed:1})],[m(1),m(2,{flaky:1})],[m(1),m(2,{ids:['p1','s2']})],[m(1),m(2,{expectedIds:['p1','s1','p2','other']})],[m(1),m(2,{ids:['p2'],skipped:0})]])assert.throws(()=>aggregate(bad,sha,2));
});
test('sign/promotion gate ignores partial PR runs, wrong SHA, failed or skipped full jobs',()=>{
 const r={head_sha:sha,event:'workflow_dispatch',conclusion:'success'},jobs=[{name:'UI full gate',conclusion:'success'}];
 assert(hasFullGate(r,jobs,sha));
 for(const bad of [{...r,event:'pull_request'},{...r,conclusion:'failure'},{...r,head_sha:'b'.repeat(40)}])assert(!hasFullGate(bad,jobs,sha));
 assert(!hasFullGate(r,[{name:'UI full gate',conclusion:'skipped'}],sha));
 assert(!hasFullGate(r,[{name:'browser',conclusion:'success'}],sha));
});
