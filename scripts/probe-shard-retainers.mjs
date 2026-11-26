// Isolated V8 heap graph probe: never loads real user data or browser profiles.
// Usage: node --expose-gc scripts/probe-shard-retainers.mjs /external/evidence.json
import {writeHeapSnapshot} from 'node:v8';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY,dayKey} from '../src/domain.js';
import {createStateQueue,planStateParts} from '../src/services/shard-state-plan.js';
import {bucket} from '../src/services/web-workspace-shards.js';
class TodoRetainerProbeTag{constructor(label){this.label=label}}
const destination=process.argv[2];if(!destination||!global.gc)throw Error('Requires explicit evidence path and --expose-gc');
async function prepare(){
 const initial={...initialState(),tasks:Array.from({length:100},(_,i)=>newTask('合成引用任务 '+i,'inbox',dayKey(),'retainer-'+i))};
 let prior=null;
 const storage=createStateQueue({[STORAGE_KEY]:JSON.stringify(initial),[BACKUP_KEY]:'synthetic',[BACKUP_KEY+'-at']:String(Date.now())},async(state,keys)=>{prior=planStateParts(state,keys,bucket,prior)});
 const next=label=>({...initial,tasks:initial.tasks.map((t,i)=>i===0?{...t,probe:new TodoRetainerProbeTag(label)}:t)});
 storage.stageWorkspace(next('retired-probe-marker'));if(!await storage.flush())throw Error('first commit failed');
 storage.stageWorkspace(next('active-probe-marker'));if(!await storage.flush())throw Error('second commit failed');
 globalThis.__todoShardRetainerProbe=storage;
}
await prepare();
for(let i=0;i<4;i++){await new Promise(r=>setImmediate(r));global.gc()}
const snapshotPath=destination+'.heapsnapshot';
try{
 writeHeapSnapshot(snapshotPath);
 const snap=JSON.parse(readFileSync(snapshotPath,'utf8')),m=snap.snapshot.meta,nf=m.node_fields.length,ef=m.edge_fields.length;
 const ni=k=>m.node_fields.indexOf(k),ei=k=>m.edge_fields.indexOf(k),nodes=snap.nodes,edges=snap.edges,strings=snap.strings;
 const typeNames=m.node_types[ni('type')],edgeNames=m.edge_types[ei('type')],count=nodes.length/nf,offsets=new Uint32Array(count+1);
 for(let i=0;i<count;i++)offsets[i+1]=offsets[i]+nodes[i*nf+ni('edge_count')]*ef;
 const name=i=>strings[nodes[i*nf+ni('name')]],type=i=>typeNames[nodes[i*nf+ni('type')]];
 function outgoing(i){const result=[];for(let j=offsets[i];j<offsets[i+1];j+=ef){const kind=edgeNames[edges[j+ei('type')]],index=edges[j+ei('name_or_index')];result.push({kind,label:['element','hidden'].includes(kind)?String(index):strings[index],to:edges[j+ei('to_node')]/nf})}return result}
 let root=-1,active=[],retired=[];
 for(let i=0;i<count;i++){
  if(type(i)==='object'&&name(i)==='TodoRetainerProbeTag'){
   const label=outgoing(i).find(e=>e.kind==='property'&&e.label==='label');
   if(label&&name(label.to)==='active-probe-marker')active.push(i);
   if(label&&name(label.to)==='retired-probe-marker')retired.push(i);
  }
  if(root<0&&type(i)==='object'&&name(i)==='global'){
   const edge=outgoing(i).find(e=>e.label==='__todoShardRetainerProbe');if(edge)root=edge.to;
  }
 }
 // Strong-edge BFS from the explicitly rooted queue, not a whole-app leak proof.
 if(root<0){for(let i=0;i<count&&root<0;i++){if(type(i)!=='object')continue;const edge=outgoing(i).find(e=>e.kind==='property'&&e.label==='__todoShardRetainerProbe');if(edge)root=edge.to}}
 const path=[];
 if(root>=0&&active.length){
  const visited=new Map([[root,null]]),queue=[root];let pos=0,target=-1;
  while(pos<queue.length){const at=queue[pos++];if(active.includes(at)){target=at;break}for(const edge of outgoing(at)){if(edge.kind==='weak'||visited.has(edge.to))continue;visited.set(edge.to,{from:at,label:edge.label,kind:edge.kind});queue.push(edge.to)}}
  if(target>=0){for(let at=target;at!==root;){const edge=visited.get(at);path.unshift({edge:edge.label,kind:edge.kind,node:name(at),type:type(at)});at=edge.from}path.unshift({node:name(root),type:type(root),edge:'global.__todoShardRetainerProbe'})}
 }
 const result={fixtureTasks:100,activeTags:active.length,retiredTags:retired.length,strongPath:path,snapshotNodes:count,method:'V8 Node queue-only synthetic heap graph, post-GC; no browser UI or undo history'};
 writeFileSync(destination,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(active.length!==1||retired.length!==0||!path.length)process.exitCode=1;
}finally{try{unlinkSync(snapshotPath)}catch{}delete globalThis.__todoShardRetainerProbe}
