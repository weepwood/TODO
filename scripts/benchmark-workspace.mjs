import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {rankCommands} from '../src/command-search.js';
import {sortTasks} from '../src/core/task-list-interaction.js';
const summarize=values=>{const v=[...values].sort((a,b)=>a-b);return {medianMs:v[Math.floor(v.length/2)],p95Ms:v[Math.ceil(v.length*.95)-1],samples:v.length}};
const measure=fn=>{for(let i=0;i<3;i++)fn(i);return summarize(Array.from({length:20},(_,i)=>{const t=performance.now();fn(i);return performance.now()-t}))};
const cases=[];
for(const count of [1000,10000]){
 global.gc?.();const before=process.memoryUsage().heapUsed;
 const tasks=Array.from({length:count},(_,i)=>({id:String(i),title:'基准任务 '+String(count-i).padStart(5,'0'),date:'2026-11-25',priority:i%4,createdAt:'2026-11-25T00:00:00Z'}));
 const entries=tasks.map(t=>({id:t.id,name:t.title,keywords:'任务 收集箱 合成备注'}));
 const search=measure(i=>{const title=tasks[(i*499)%count].title;if(rankCommands(entries,title,60)[0]?.name!==title)throw Error('search mismatch')});
 const sort=measure(()=>{if(sortTasks(tasks,'title','asc')[0]?.id!==String(count-1))throw Error('sort mismatch')});
 global.gc?.();const heapDelta=process.memoryUsage().heapUsed-before;
 cases.push({count,search,sort,heapDeltaBytes:heapDelta});
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,method:'20 timed samples after 3 warmups; forced GC if available; retained fixture heap delta, not browser/process memory',cases},null,2));
