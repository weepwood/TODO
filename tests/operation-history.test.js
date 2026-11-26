import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../src/core/domain.js';
import {buildHistoryPreview,prepareHistory,confirmationText} from '../src/core/operation-history.js';
import {digest} from '../src/services/cloud-core.js';
const now=new Date('2026-11-26T08:00:00'),id='00000000-0000-4000-8000-000000000601';
const task=(id,fields={})=>({...newTask(id,'inbox','',id),...fields});
const state=tasks=>({...initialState(),tasks});
const entry=(version,rows,source='cli',extra={})=>({version,source,groupId:id,body:{rows,protectedWorkspace:[]},...extra});
const journal=(...entries)=>({intact:true,head:entries[0].version,entries});
const field=(before,after)=>({before:{present:true,value:before},after:{present:true,value:after}});
const row=(id,fields,protectedFields=[])=>({id,fields,protected:protectedFields});
test('field-level inverse preserves later unrelated edits; overlapping edits and ABA are rejected',async()=>{
 const d=state([task('a',{priority:3,title:'manual title'}),task('b',{priority:2})]);
 const j=journal(entry(2,[row('a',{title:field('a','manual title')})],'local'),entry(1,[row('a',{priority:field(0,3)}),row('b',{priority:field(0,2)})]));
 const p=await buildHistoryPreview(d,{op:'history-preview',version:1,selection:[{id:'a',fields:['priority']}]},j,now);
 assert.equal(p.next.tasks[0].priority,0);assert.equal(p.next.tasks[0].title,'manual title');assert.equal(p.next.tasks[1].priority,2);
 const aba=journal(entry(3,[row('a',{priority:field(1,3)})],'local'),entry(2,[row('a',{priority:field(3,1)})],'local'),entry(1,[row('a',{priority:field(0,3)})]));
 const blocked=await buildHistoryPreview(d,{op:'history-preview',version:1},aba,now);assert.equal(blocked.rows.length,0);assert.equal(blocked.conflicts.length,1);assert.deepEqual(blocked.conflicts[0].comparison[0],{field:"priority",before:{present:true,value:0},after:{present:true,value:3},current:{present:true,value:3}});
});
test('undo creation via trash, no permanent deletion, protect edited and used tasks; redo is another inverse',async()=>{
 const t=task('a'),d=state([t]);
 const j=journal(entry(1,[{id:'a',created:true,afterHash:await digest(t)}]));
 const p=await buildHistoryPreview(d,{op:'history-preview',version:1},j,now);
 assert.equal(p.next.tasks.length,1);assert.equal(p.next.tasks[0].deletedAt,now.toISOString());
 const redo=await buildHistoryPreview(p.next,{op:'history-preview',version:2},journal(entry(2,[row('a',{deletedAt:field(null,now.toISOString())})]),j.entries[0]),now);
 assert.equal(redo.next.tasks[0].deletedAt,null);
 const changed=state([{...t,title:'edited'}]);assert.equal((await buildHistoryPreview(changed,{op:'history-preview',version:1},j,now)).rows.length,0);
 const used=state([t,task('child',{parentId:'a'})]);assert.equal((await buildHistoryPreview(used,{op:'history-preview',version:1},j,now)).rows.length,0);
});
test('point in time only reverts CLI changes, preserves manual edits, rejects log gap',async()=>{
 const d=state([task('a',{priority:3}),task('b',{priority:2,title:'manual'})]);
 const j=journal(entry(3,[row('a',{priority:field(1,3)})]),entry(2,[row('b',{title:field('b','manual')})],'local'),entry(1,[row('a',{priority:field(0,1)})]));
 const p=await buildHistoryPreview(d,{op:'history-preview',afterVersion:0},j,now);assert.equal(p.next.tasks[0].priority,0);assert.equal(p.next.tasks[1].title,'manual');
 await assert.rejects(buildHistoryPreview(d,{op:'history-preview',afterVersion:0},journal(j.entries[0],j.entries[2]),now),e=>e.code==='HISTORY_GAP');
 const grouped=await buildHistoryPreview(d,{op:'history-preview',groupId:id},j,now);assert.equal(grouped.next.tasks[0].priority,0);
});
test('repeat and protected execution not reversed, schedule groups atomic, conflicts refused',async()=>{
 const d=state([task('a',{date:'2026-11-27',time:'10:00'}),task('b',{date:'2026-11-27',time:'09:00'}),task('repeat',{repeat:'daily',date:'2026-11-27',priority:3})]);
 const j=journal(entry(1,[row('a',{time:field('09:00','10:00'),date:field('2026-11-26','2026-11-27')}),row('repeat',{priority:field(0,3)})]));
 const r=await buildHistoryPreview(d,{op:'history-preview',version:1,selection:[{id:'a',fields:['time']},{id:'repeat'}]},j,now);assert.equal(r.rows.length,0);assert.equal(r.conflicts.length,2);
 const q=journal(entry(1,[row('a',{time:field('09:00','10:00')})]));
 await assert.rejects(buildHistoryPreview(d,{op:'history-preview',version:1},q,now),e=>e.code==='TIME_CONFLICT');
});
test('saved reference, expiry and current snapshot guard; confirmation contains actual field diff',async()=>{
 const d=state([task('a',{priority:3})]),j=journal(entry(1,[row('a',{priority:field(0,3)})]));
 const p=await prepareHistory(d,{op:'history-preview',version:1},id,now,{journal:j});
 const ref={id,kind:'history-preview',status:'saved',result:p.result};
 const req={op:'history-apply',previewId:id,confirm:true};
 await assert.rejects(prepareHistory(d,req,id,now,{journal:j}),e=>e.code==='REFERENCE_INVALID');
 await assert.rejects(prepareHistory(d,{...req,confirm:false},id,now,{journal:j,reference:ref}),e=>e.code==='CONFIRM_REQUIRED');
 await assert.rejects(prepareHistory({...d,theme:'other'},req,id,now,{journal:j,reference:ref}),e=>e.code==='STALE_VERSION');
 await assert.rejects(prepareHistory(d,req,id,new Date(+now+16*60000),{journal:j,reference:ref}),e=>e.code==='REFERENCE_EXPIRED');
 const a=await prepareHistory(d,req,id,now,{journal:j,reference:ref});assert.equal(a.next.tasks[0].priority,0);assert.match(confirmationText(req.op,d,a.next),/priority: 3 → 0/);
});
test('persisted snapshot and journal must match after the save barrier',async()=>{
 const {readConsistentHistory,snapshotFingerprint}=await import('../src/core/operation-history.js');
 const d=state([task('a')]);let raw=JSON.stringify(d);let ready=true;
 const storage={flush:async()=>ready,getItem:()=>raw};
 const hash=await snapshotFingerprint(raw);
 const j={workspaceFingerprint:hash,intact:true,head:1,entries:[]};
 assert.equal(await readConsistentHistory(storage,d,async()=>j),j);
 await assert.rejects(readConsistentHistory(storage,d,async()=>({...j,workspaceFingerprint:'stale'})),e=>e.code==='STALE_WORKSPACE');
 await assert.rejects(readConsistentHistory(storage,d,async()=>{raw=JSON.stringify({...d,theme:'changed'});return j}),e=>e.code==='STALE_WORKSPACE');
 raw=JSON.stringify(d);ready=false;
 await assert.rejects(readConsistentHistory(storage,d,async()=>j),e=>e.code==='STALE_WORKSPACE');
});
test('invalid selections and later trash lifecycle cannot silently restore earlier fields',async()=>{
 const d=state([task('a',{priority:3})]);
 const j=journal(entry(3,[row('a',{deletedAt:field(now.toISOString(),null)})],'local'),entry(2,[row('a',{deletedAt:field(null,now.toISOString())})],'local'),entry(1,[row('a',{priority:field(0,3)})]));
 const r=await buildHistoryPreview(d,{op:'history-preview',version:1},j,now);
 assert.equal(r.rows.length,0);assert.equal(r.conflicts.length,1);
 for(const selection of [[null],[{id:'a',fields:null}],[{id:'missing'}],[{id:'a',fields:[]}]]){
  await assert.rejects(buildHistoryPreview(d,{op:'history-preview',version:1,selection},j,now),e=>e.code==='INVALID_ARGUMENT');
 }
});
