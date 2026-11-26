// Isolated V8 heap graph probe: never loads real user data or browser profiles.
// Usage: node --expose-gc scripts/probe-shard-retainers.mjs /external/evidence.json
import {inspectShardHeap} from './inspect-shard-heap.mjs';
import {writeHeapSnapshot} from 'node:v8';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY,dayKey} from '../src/domain.js';
import {createStateQueue,planStateParts} from '../src/services/shard-state-plan.js';
import {bucket} from '../src/services/web-workspace-shards.js';
const makeTag=label=>({label,syntheticRetainerProbe:true});
const destination=process.argv[2];if(!destination||!global.gc)throw Error('Requires explicit evidence path and --expose-gc');
async function prepare(){
 const initial={...initialState(),tasks:Array.from({length:100},(_,i)=>newTask('合成引用任务 '+i,'inbox',dayKey(),'retainer-'+i))};
 let prior=null;
 const storage=createStateQueue({[STORAGE_KEY]:JSON.stringify(initial),[BACKUP_KEY]:'synthetic',[BACKUP_KEY+'-at']:String(Date.now())},async(state,keys)=>{prior=planStateParts(state,keys,bucket,prior)});
 const next=label=>({...initial,tasks:initial.tasks.map((t,i)=>i===0?{...t,probe:makeTag(label)}:t)});
 storage.stageWorkspace(next('retired-probe-marker'));if(!await storage.flush())throw Error('first commit failed');
 storage.stageWorkspace(next('active-probe-marker'));if(!await storage.flush())throw Error('second commit failed');
 globalThis.__todoShardRetainerProbe=storage;
}
await prepare();
for(let i=0;i<4;i++){await new Promise(r=>setImmediate(r));global.gc()}
const snapshotPath=destination+'.heapsnapshot';
try{
 writeHeapSnapshot(snapshotPath);
 const result={fixtureTasks:100,...inspectShardHeap(JSON.parse(readFileSync(snapshotPath,'utf8'))),method:'V8 Node queue-only synthetic heap graph, post-GC; no browser UI or undo history'};
 writeFileSync(destination,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(result.activeTags!==1||result.retiredTags!==0||!result.strongPath.length)process.exitCode=1;
}finally{try{unlinkSync(snapshotPath)}catch{}delete globalThis.__todoShardRetainerProbe}
