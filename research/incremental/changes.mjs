// Research-only. Not imported by production. Inputs are sealed JSON snapshots
// from the shared editor; unknown/malformed graphs fall back, never silently drop.
import {sealWorkspace} from '../../src/services/shard-state-plan.js';
import {canonical} from '../../src/services/cloud-core.js';
import {migrateState} from '../../src/core/domain.js';
const eq=(a,b)=>a===b||canonical(a)===canonical(b);
const verified=new WeakSet();
function jsonGraph(v){
 if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;
 if(!v||typeof v!=='object')throw Error('non JSON value');
 if(verified.has(v))return;
 if(!Object.isFrozen(v))throw Error('unsealed graph');
 if(Array.isArray(v)){
  if(Reflect.ownKeys(v).length!==v.length+1)throw Error('sparse or decorated array');
  for(let i=0;i<v.length;i++){if(!Object.hasOwn(v,i))throw Error('sparse array');jsonGraph(v[i])}
 }else{
  for(const k of Reflect.ownKeys(v)){if(typeof k!=='string'||!Object.getOwnPropertyDescriptor(v,k)?.enumerable)throw Error('non JSON property');jsonGraph(v[k])}
 }
 verified.add(v);
}
const map=tasks=>{const m=new Map();for(const t of tasks){if(typeof t?.id!=='string'||!t.id||m.has(t.id))throw Error('task id');m.set(t.id,t)}return m};
export function changes(before,after){
 sealWorkspace(before);sealWorkspace(after);jsonGraph(before);jsonGraph(after);
 migrateState(before);migrateState(after);
 return diffSealed(before,after);
}
// Only the controlled R3 editor calls this fast path. It is not an import API.
export function diffSealed(before,after){
 sealWorkspace(before);sealWorkspace(after);jsonGraph(before);jsonGraph(after);
 const a=map(before.tasks),b=map(after.tasks);
 const put=[],remove=[];
 for(const [id,t] of b)if(!a.has(id)||!eq(a.get(id),t))put.push({id,before:a.get(id)??null,after:t});
 for(const [id,t] of a)if(!b.has(id))remove.push({id,before:t});
 const oldOrder=[...a.keys()],order=[...b.keys()];
 const {tasks:_,...m}=before,{tasks:__,...n}=after;
 return {put,remove,order:eq(oldOrder,order)?null:order,meta:eq(m,n)?null:{before:m,after:n}};
}
export function replay(before,p){
 const m=map(before.tasks);
 for(const x of p.remove){if(!m.has(x.id)||!eq(m.get(x.id),x.before))throw Error('stale remove');m.delete(x.id)}
 for(const x of p.put){if(!eq(m.get(x.id)??null,x.before)||x.id!==x.after?.id)throw Error('stale put');m.set(x.id,x.after)}
 const order=p.order??before.tasks.map(t=>t.id);
 if(order.length!==m.size||new Set(order).size!==order.length||order.some(id=>!m.has(id)))throw Error('order mismatch');
 const {tasks:_,...meta}=before;
 if(p.meta&&!eq(meta,p.meta.before))throw Error('stale metadata');
 return {...(p.meta?.after??meta),tasks:order.map(id=>m.get(id))};
}
// Reference reuse is an optimization only. Immutable seal plus independent
// replay check prevents missed updates. Oversized changes go to full path.
export function plan(before,after,limit=900000){
 try{const patch=changes(before,after);if(!eq(replay(before,patch),after))throw Error('replay mismatch');
 return new TextEncoder().encode(JSON.stringify(patch)).length<=limit?{kind:'delta',patch}:{kind:'snapshot',reason:'budget'};}
 catch(e){return {kind:'reject',reason:String(e.message)}}
}
