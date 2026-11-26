// Controlled research editor. No arbitrary callback crosses the fast boundary.
// Complex operations retain complete validation; only existing-row title/
// priority batches are eligible for the reduced validation path.
import {migrateState,newTask,reorderTasks,completeTask,reopenTask} from '../../src/core/domain.js';
import {canLink} from '../../src/core/advanced.js';
import {sealWorkspace} from '../../src/services/shard-state-plan.js';
import {applyWorkspaceEdit} from '../../src/components/useWorkspaceMutations.js';
import {diffSealed,plan} from './changes.mjs';
const shape=(o,allowed)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k)))throw Error('invalid operation shape')};
const title=t=>typeof t==='string'&&t.trim()&&t.length<=500;
export function createCaptureSession(initial){
 migrateState(initial);sealWorkspace(initial);let state=initial;
 const find=id=>{const t=state.tasks.find(t=>t.id===id);if(!t)throw Error('unknown task');return t};
 function apply(op){
  const prior=state;let transform,fast=false;
  switch(op?.kind){
   case 'batch':{
    shape(op,['kind','edits']);
    if(!Array.isArray(op.edits)||op.edits.length<1||op.edits.length>100)throw Error('batch limit');
    const edits=new Map();
    for(const e of op.edits){shape(e,['id','title','priority']);find(e.id);if(edits.has(e.id)||(!Object.hasOwn(e,'title')&&!Object.hasOwn(e,'priority')))throw Error('invalid batch');
     if(Object.hasOwn(e,'title')&&!title(e.title)||Object.hasOwn(e,'priority')&&(!Number.isInteger(e.priority)||e.priority<0||e.priority>3))throw Error('invalid task fields');
     const {id,...fields}=e;edits.set(id,fields);}
    transform=d=>({...d,tasks:d.tasks.map(t=>edits.has(t.id)?{...t,...edits.get(t.id)}:t)});fast=true;break;
   }
   case 'create':
    shape(op,['kind','id','title','listId']);
    if(typeof op.id!=='string'||!op.id||op.id.length>200||state.tasks.some(t=>t.id===op.id)||!title(op.title)||!state.lists.some(l=>l.id===op.listId))throw Error('invalid create');
    transform=d=>({...d,tasks:[...d.tasks,newTask(op.title,op.listId,'',op.id)]});break;
   case 'reorder':
    shape(op,['kind','from','to']);find(op.from);find(op.to);transform=d=>({...d,tasks:reorderTasks(d.tasks,op.from,op.to)});break;
   case 'complete':
    shape(op,['kind','id','day']);find(op.id);if(!/^\d{4}-\d{2}-\d{2}$/.test(op.day)||!Number.isFinite(Date.parse(op.day))||new Date(op.day).toISOString().slice(0,10)!==op.day)throw Error('invalid day');
    transform=d=>({...d,tasks:completeTask(d.tasks,op.id,op.day)});break;
   case 'reopen':
    shape(op,['kind','id']);find(op.id);transform=d=>({...d,tasks:reopenTask(d.tasks,op.id)});break;
   case 'parent':
    shape(op,['kind','id','parentId']);find(op.id);if(op.parentId!==null){find(op.parentId);if(!canLink(state.tasks,op.id,op.parentId,'parentId'))throw Error('invalid relation')}
    transform=d=>({...d,tasks:d.tasks.map(t=>t.id===op.id?{...t,parentId:op.parentId}:t)});break;
   case 'tag':
    shape(op,['kind','id','tagId','name']);find(op.id);
    if(typeof op.tagId!=='string'||!op.tagId||op.tagId.length>200||state.tags.some(t=>t.id===op.tagId)||!title(op.name))throw Error('invalid tag');
    transform=d=>({...d,tags:[...d.tags,{id:op.tagId,name:op.name,color:'#777777'}],tasks:d.tasks.map(t=>t.id===op.id?{...t,tags:[...t.tags,op.tagId]}:t)});break;
   default:throw Error('unsupported controlled operation');
  }
  const meta={id:crypto.randomUUID(),at:new Date().toISOString(),source:'manual',session:'r4-controlled',trigger:'event'};
  const next=applyWorkspaceEdit(prior,transform,meta,{allowAutomation:false,rules:[]});
  let result;
  if(fast){
   const patch=diffSealed(prior,next);
   if(new TextEncoder().encode(JSON.stringify(patch)).length>900000){migrateState(next);result={kind:'snapshot'}}
   else result={kind:'delta',patch};
  }else result=plan(prior,next);
  if(result.kind==='reject')throw Error(result.reason);
  state=next;return {...result,state:next};
 }
 return {get state(){return state},apply,priority(id,priority){return apply({kind:'batch',edits:[{id,priority}]})},external(next){
  const p=plan(state,next);if(p.kind!=='reject')state=next;return p;
 }};
}
