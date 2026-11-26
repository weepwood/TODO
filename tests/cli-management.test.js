import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../src/core/domain.js';
import {prepareCliOperation as run} from '../src/core/cli-operations.js';
import {finalizeManagement} from '../src/core/cli-management.js';
import {digest} from '../src/services/cloud-core.js';
import {applyWorkspaceEdit} from '../src/components/useWorkspaceMutations.js';
import {taskConflicts} from '../src/core/advanced.js';
const date='2026-11-27',now=new Date(date+'T08:00:00'),id='00000000-0000-4000-8000-000000000301',id2='00000000-0000-4000-8000-000000000302';
const mk=(id,fields={})=>({...newTask(id,'inbox','',id),createdAt:'2026-10-01T00:00:00Z',...fields});
const state=(tasks)=>({...initialState(),tasks});
const ref=(p,kind,which=id)=>({id:which,kind,status:'saved',result:p.result});
const editor=(d,p)=>applyWorkspaceEdit(d,()=>p.next,{id:id2,at:now.toISOString(),source:'device',session:'qa',trigger:'event'},{allowAutomation:false,rules:[]});
const apply=async(d,p,kind,at=now)=>run(d,{op:'preview-apply',previewId:id,confirm:true},id2,at,{reference:ref(p,kind)});
test('context and explanation reuse actual planner, no notes or external title exposure',async()=>{
 const d=state([mk('fixed',{date,time:'10:00',duration:30,planLocked:true,notes:'private'}),mk('a',{duration:45,deadline:date+'T11:15'}),mk('b',{duration:60,deadline:date+'T11:15'}),mk('blocked',{dependsOn:['a'],duration:20})]);
 const req={op:'context',date,days:1,start:'09:00',end:'11:15',limit:3};
 const r=await run(d,req,id,now);assert.equal(r.next,d);assert.equal(r.result.counts.pending,4);assert.equal(r.result.rows.length,3);assert(!JSON.stringify(r.result).includes('private'));assert.equal(r.result.capacity[0].planned,105);
 const e=await run(d,{op:'plan-explain',id:'blocked',date,start:'09:00',end:'11:15'},id,now);assert.match(e.result.evaluation.reason,/前置/);
});
test('preview, actual editor, safe inverse, stale workspace, fake and expired reference',async()=>{
 const d=state([mk('a',{duration:45,deadline:date+'T11:15'}),mk('fixed',{date,time:'10:00',duration:30,planLocked:true})]);
 const r={op:'plan-preview',date,start:'09:00',end:'11:15'};
 const p=await run(d,r,id,now);assert.equal(p.next,d);assert.equal(p.result.rows.length,1);
 await assert.rejects(run(d,{op:'preview-apply',previewId:id,confirm:true},id2,now),e=>e.code==='REFERENCE_INVALID');
 await assert.rejects(run(d,{op:'preview-apply',previewId:id,confirm:false},id2,now,{reference:ref(p,r.op)}),e=>e.code==='CONFIRM_REQUIRED');
 await assert.rejects(apply({...d,tasks:d.tasks.map(t=>({...t,priority:2}))},p,r.op),e=>e.code==='STALE_VERSION');
 await assert.rejects(apply(d,p,r.op,new Date(+now+16*60000)),e=>e.code==='REFERENCE_EXPIRED');
 const a=await apply(d,p,r.op);const actual=editor(d,a);assert.equal(actual.tasks[1],d.tasks[1]);assert.equal(taskConflicts(actual.tasks).size,0);
 const saved=await finalizeManagement(d,a,actual);assert(saved.undo.supported);
 await assert.rejects(finalizeManagement(d,a,{...actual,tasks:actual.tasks.map(t=>({...t,priority:1}))}),e=>e.code==='UNPREVIEWED_EFFECT');
 const undo=await run(actual,{op:'changes-undo',receiptId:id2,confirm:true},id,now,{reference:{id:id2,kind:'preview-apply',status:'saved',result:saved}});assert.equal(undo.next.tasks[0].date,'');assert.equal(undo.next.tasks[0].time,'');
 await assert.rejects(run({...actual,theme:'dark'},{op:'changes-undo',receiptId:id2,confirm:true},id,now,{reference:{id:id2,kind:'preview-apply',status:'saved',result:saved}}),e=>e.code==='STALE_VERSION');
});
test('atomic swap permits intermediate overlaps but rejects final conflicts and past blocks',async()=>{
 const d=state([mk('a',{date,time:'09:00',duration:60}),mk('b',{date,time:'10:00',duration:60})]);
 const a=await digest(d.tasks[0]),b=await digest(d.tasks[1]);
 const q={op:'changes-preview',changes:[{id:'a',version:a,fields:{time:'10:00'}},{id:'b',version:b,fields:{time:'09:00'}}]};
 const p=await run(d,q,id,now);assert.equal(p.result.rows.length,2);
 const r=await apply(d,p,q.op);assert.equal(r.next.tasks[0].time,'10:00');assert.equal(r.next.tasks[1].time,'09:00');assert.equal(taskConflicts(r.next.tasks).size,0);
 await assert.rejects(run(d,{...q,changes:q.changes.slice(0,1)},id,now),e=>e.code==='TIME_CONFLICT');
 await assert.rejects(run(d,{...q,changes:[{id:'a',version:a,fields:{time:'07:00'}}]},id,now),e=>e.code==='TIME_CONFLICT');
 await assert.rejects(run(d,{...q,changes:[{id:'a',version:'fake',fields:{priority:1}}]},id,now),e=>e.code==='STALE_VERSION');
});
test('split uses deterministic child IDs, existing dependencies and estimates, no automatic undo',async()=>{
 const d=state([mk('parent',{duration:120})]);const p=await run(d,{op:'split-preview',id:'parent',version:await digest(d.tasks[0]),children:[{title:'read',duration:30,checklist:['a']},{title:'build',duration:90,after:[1]}]},id,now);
 assert.equal(p.result.rows.length,2);assert.equal(p.result.analysis.estimatedMinutes,120);
 const a=await apply(d,p,'split-preview');assert.equal(a.next.tasks[2].parentId,'parent');assert.deepEqual(a.next.tasks[2].dependsOn,[id+':1']);assert.equal(a.next.tasks[1].checklist.length,1);
 assert.equal((await finalizeManagement(d,a,editor(d,a))).undo.supported,false);
});
test('reflow only movable conflicts, audit candidates and evidence unknown',async()=>{
 const d=state([mk('fixed',{date,time:'10:00',duration:30,planLocked:true}),mk('move',{date,time:'10:15',duration:30}),mk('duplicate',{title:'move'}),mk('safe',{date,time:'14:00',duration:30})]);
 const p=await run(d,{op:'reflow-preview',date,start:'09:00',end:'18:00'},id,now);assert.equal(p.result.rows.length,1);assert.equal(p.result.rows[0].id,'move');
 const a=await apply(d,p,'reflow-preview');assert.equal(a.next.tasks[0],d.tasks[0]);assert.equal(a.next.tasks[3],d.tasks[3]);assert.equal(taskConflicts(a.next.tasks).size,0);
 const audit=await run(d,{op:'audit',ageDays:20},id,now);assert.equal(audit.result.backlogTotal,4);assert.equal(audit.result.duplicateGroupsTotal,1);
 const review=await run(d,{op:'review',period:'week'},id,now);assert.equal(review.result.calibration.count,0);assert.equal(review.result.calibration.mae,null);
});
