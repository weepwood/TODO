// Controlled CPU/heap microbenchmark; no real data, no production state.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY} from '../src/domain.js';
import {bucket,splitSnapshot,diffParts} from '../src/services/web-workspace-shards.js';
import * as current from '../src/services/shard-state-plan.js';
const output=process.argv[2];if(!output||!global.gc)throw Error('explicit output and --expose-gc required');
async function historical(commit){
 const raw=execFileSync('git',['show',commit+':src/services/shard-state-plan.js'],{encoding:'utf8'});
 const source=raw.replace(/from '([^']+)'/g,(_,p)=>"from '"+pathToFileURL(resolve('src/services',p)).href+"'");
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const versions=[['unsealed-reference-baseline',await historical('c144271')],['deep-freeze-baseline',await historical('cf5ee33')],['current',current]];
const raw=JSON.stringify({...initialState(),tasks:Array.from({length:10000},(_,i)=>newTask('基准 '+i,'inbox','2026-11-26','bench-'+i))}),keys={[BACKUP_KEY]:raw,[BACKUP_KEY+'-at']:'1'};
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const results=[];
for(let round=0;round<3;round++)for(const [name,m] of [...versions.slice(round),...versions.slice(0,round)]){
 global.gc();const baseline=process.memoryUsage().heapUsed;let state=JSON.parse(raw),start=performance.now(),plan=m.planStateParts(state,keys,bucket),coldMs=performance.now()-start;
 const edit=[],scan=[];for(let i=0;i<12;i++){
  const t=performance.now();state={...state,tasks:state.tasks.map((x,k)=>k===i*701?{...x,title:'changed '+i}:x)};scan.push(performance.now()-t);
  start=performance.now();plan=m.planStateParts(state,keys,bucket,plan);edit.push(performance.now()-start);
 }
 const delta=diffParts(plan.parts,splitSnapshot({...keys,[STORAGE_KEY]:JSON.stringify(state)}));if(delta.put.length||delta.remove.length)throw Error('oracle mismatch');
 global.gc();const heapDeltaBytes=process.memoryUsage().heapUsed-baseline;
 // Separate real queue startup (private initial parse, UI hydration, stage/flush).
 let queuedPlan=null;const qStart=performance.now();
 const store=m.createStateQueue({[STORAGE_KEY]:raw,...keys},async(state,metadata)=>{queuedPlan=m.planStateParts(state,metadata,bucket,queuedPlan)},()=>{},()=>1000);
 const queueConstructMs=performance.now()-qStart;
 const ui=JSON.parse(store.getItem(STORAGE_KEY));store.stageWorkspace(ui);if(!await store.flush())throw Error('queue startup failed');
 const queueStartupMs=performance.now()-qStart;
 results.push({name,round,coldMs,editMedianMs:median(edit.slice(2)),mapMedianMs:median(scan.slice(2)),heapDeltaBytes,queueConstructMs,queueStartupMs,reused:plan.reused});
}
const summary=versions.map(([name])=>{const rows=results.filter(r=>r.name===name);return {name,coldMs:median(rows.map(r=>r.coldMs)),editMedianMs:median(rows.map(r=>r.editMedianMs)),mapMedianMs:median(rows.map(r=>r.mapMedianMs)),heapDeltaBytes:median(rows.map(r=>r.heapDeltaBytes)),queueConstructMs:median(rows.map(r=>r.queueConstructMs)),queueStartupMs:median(rows.map(r=>r.queueStartupMs)),reused:rows[0].reused}});
writeFileSync(output,JSON.stringify({method:'rotating order, 3 repeats, 10000 tasks, same fixture, GC before/after, 12 edits excluding first two, Node V8 not browser UI',summary,results},null,2));console.log(JSON.stringify(summary));
