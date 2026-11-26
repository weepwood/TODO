import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState,nextOccurrence,dayKey} from '../src/core/domain.js';
import {prepareCliOperation as run} from '../src/core/cli-operations.js';
import {digest} from '../src/services/cloud-core.js';
import {historyReducer} from '../src/history.js';
import {createNativeStore} from '../src/services/native-store.js';
import {STORAGE_KEY} from '../src/core/domain.js';
import {applyWorkspaceEdit} from '../src/components/useWorkspaceMutations.js';
const now=new Date('2026-11-26T12:00:00'),rid='00000000-0000-4000-8000-000000000200';
const request=(d,op,i=rid)=>run(d,op,i,now);
const ver=t=>digest(t);
test('rich create: actual existing models, recurring rules, two blocks, reminders, organization and children',async()=>{
 let d=initialState();d.tags=[{id:'tag',name:'math'}];d.lists[1].sections=[{id:'section',name:'研究'}];
 const r=await request(d,{op:'create',tasks:[{title:'math',listId:'work',sectionId:'section',tags:['tag'],repeat:'weekdays',weekdays:[1,3,5],interval:2,repeatUntil:'2027-03-02',repeatCount:20,blocks:[{date:'2026-12-02',start:'19:00',end:'20:00'},{date:'2026-12-02',start:'21:00',end:'21:30'}],duration:90,reminderOffsets:[15,5],checklist:['read','practice'],children:[{title:'child'}]}]});
 const [t,c]=r.next.tasks;assert.equal(r.result.task_count,2);assert(r.result.warning);
 assert.equal(t.planMinutes,60);assert.equal(t.duration,90);assert.equal(t.planSegments[0].minutes,30);assert.equal(t.reminderAt,'2026-12-02T18:45');assert.equal(t.extraReminders[0].at,'2026-12-02T18:55');assert.equal(t.repeat,'weekdays');assert.equal(nextOccurrence(t,t.date),'2026-12-04');assert.equal(t.checklist.length,2);assert.equal(c.parentId,t.id);assert.equal(c.sectionId,'section');
 const calendar=await request(r.next,{op:'calendar',from:'2026-12-02'});assert.equal(calendar.result.blocks.length,2);
 assert.equal((await request(r.next,{op:'query',tagId:'tag',q:'math'})).result.total,1);
 assert.equal((await request(r.next,{op:'show',id:t.id})).result.task.checklist.length,2);
 assert.doesNotThrow(()=>migrateState(r.next));
});
test('reject invalid fields, dates, repeats, references, overlaps; explicit overlap opt-in',async()=>{
 let d=initialState();
 const block={date:'2026-12-02',start:'09:00',end:'10:00'};
 for(const t of [{title:'x',status:'completed'},{title:'x',repeat:'daily'},{title:'x',repeat:'weekdays',date:'2026-12-02',weekdays:[]},{title:'x',date:'2026-02-30'},{title:'x',tags:['missing']},{title:'x',parentId:'missing'},{title:'x',blocks:[block,block]},{title:'x',blocks:[{...block,end:'08:00'}]},{title:'x',reminderOffsets:[5]}]){
  await assert.rejects(request(d,{op:'create',tasks:[t]}));
 }
 d=(await request(d,{op:'create',tasks:[{title:'busy',blocks:[block]}]})).next;
 await assert.rejects(request(d,{op:'create',tasks:[{title:'overlap',blocks:[block]}]},rid+'-other'),/冲突/);
 assert.equal((await request(d,{op:'create',allowConflict:true,tasks:[{title:'overlap',blocks:[block]}]},rid+'-other')).next.tasks.length,2);
 const overnight=await request(initialState(),{op:'create',tasks:[{title:'overnight',blocks:[{date:'2026-12-02',start:'23:00',endDate:'2026-12-03',end:'01:00'}]}]});assert.equal(overnight.next.tasks[0].planMinutes,120);
});
test('series scope, locked planning, stale version, actual repeat generation and safe reopen',async()=>{
 let d=(await request(initialState(),{op:'create',tasks:[{title:'series',date:'2026-12-02',time:'09:00',repeat:'daily',repeatCount:3}]})).next;
 const t=d.tasks[0],v=await ver(t);
 await assert.rejects(request(d,{op:'update',id:t.id,version:v,fields:{repeat:'weekly'}}),/scope=series/);
 d=(await request(d,{op:'update',id:t.id,version:v,scope:'series',fields:{interval:2}})).next;
 await assert.rejects(request(d,{op:'complete',id:t.id,version:v}),/变化/);
 const r=await request(d,{op:'complete',id:t.id,version:await ver(d.tasks[0])});assert.equal(r.next.tasks.length,2);assert.equal(r.next.tasks[1].date,'2026-12-04');
 await assert.rejects(request(r.next,{op:'reopen',id:t.id,version:await ver(r.next.tasks[0]),confirmSeries:true}));
 d=(await request(initialState(),{op:'create',tasks:[{title:'locked',blocks:[{date:'2026-12-02',start:'09:00',end:'10:30'}],planLocked:true}]})).next;
 assert.equal(d.tasks[0].planMinutes,90);
 await assert.rejects(request(d,{op:'update',id:d.tasks[0].id,version:await ver(d.tasks[0]),fields:{date:'2026-12-03'}}),/锁定/);
});
test('ordinary lifecycle, move/postpone, query versions, entity management and safe undo',async()=>{
 let d=initialState();
 const entity=await request(d,{op:'entity-create',kind:'tag',name:'开发'});d=entity.next;
 d=(await request(d,{op:'entity-rename',kind:'tag',id:entity.result.id,version:entity.result.version,name:'研发'})).next;
 const r=await request(d,{op:'create',tasks:[{title:'ordinary',date:'2026-11-26',tags:[entity.result.id]}]},rid+'-a');d=r.next;
 let t=d.tasks[0];
 const update=async(op,extra={})=>{const out=await request(d,{op,id:t.id,version:await ver(t),...extra});d=out.next;t=d.tasks.find(x=>x.id===t.id);return out};
 await update('move',{listId:'work'});assert.equal(t.listId,'work');
 await update('postpone',{days:1});assert.equal(t.date,'2026-11-27');
 await update('update',{fields:{notes:'review',priority:3}});assert.equal(t.notes,'review');
 const done=await update('complete');assert.equal(t.status,'completed');assert(done.result.undo);
 await update('undo-completion',done.result.undo);assert.equal(t.status,'pending');
 assert.equal((await request(d,{op:'query',view:'upcoming',q:'review'})).result.total,1);
 assert.equal((await request(d,{op:'stats',date:'2026-11-26'})).result.completed,0);
 const trashed={...t,deletedAt:now.toISOString()},trashState={...d,tasks:[trashed]};
 await assert.rejects(request(trashState,{op:'show',id:t.id}));
 const shown=(await request(trashState,{op:'show',id:t.id,includeDeleted:true})).result.task;
 assert.equal((await request(trashState,{op:'restore',id:t.id,version:shown.version})).next.tasks[0].deletedAt,null);
});
test('habit and focus actions use existing timer identity and settlement rules',async()=>{
 let d=initialState();d=(await request(d,{op:'habit-create',name:'exercise',weeklyGoal:5})).next;
 const r=await request(d,{op:'catalog'});d=(await request(d,{op:'habit-check',id:rid,version:r.result.habits[0].version,checked:true})).next;
 assert.deepEqual(d.habits[0].days,[dayKey(now)]);
 const catalog=await request(d,{op:'catalog'});d=(await request(d,{op:'focus-start',version:catalog.result.timerVersion,minutes:25})).next;
 assert.equal(d.timer.target,1500);const v=await ver(d.timer);
 d=(await request(d,{op:'focus-change',version:v,action:'pause'})).next;assert.equal(d.timer.startedAt,null);
 await assert.rejects(request(d,{op:'focus-change',version:v,action:'resume'}),/变化/);
 d=(await request(d,{op:'focus-change',version:await ver(d.timer),action:'save'})).next;assert.equal(d.timer,null);assert.equal(d.sessions.length,0);
});
test('receipt history and native store barrier survive coalescing, failed write and retry',async()=>{
 const d=initialState(),p={...d,theme:'dark'},result={id:rid,status:'saved',result:{}};
 const state={data:d,past:[],future:[]};
 const applied=historyReducer(state,{type:'cli',expected:d,next:p,result});assert.equal(applied.data,p);assert.equal(applied.past.length,1);
 const raced=historyReducer({...state,data:p},{type:'cli',expected:d,next:d,result});assert.equal(raced.cliReceipt.result.status,'cancelled');assert.equal(raced.data,p);
 const later=historyReducer(applied,{type:'edit',value:{...p,theme:'light'},record:false});assert.equal(later.cliReceipt.data,p);
 const writes=[];let fail=true;
 const storage=createNativeStore({[STORAGE_KEY]:JSON.stringify(d)},async s=>writes.push(['normal',JSON.parse(s[STORAGE_KEY]).theme]),()=>{},async(s,r)=>{if(fail)throw Error('injected rollback');writes.push(['receipt',JSON.parse(s[STORAGE_KEY]).theme,r.id])});
 storage.stageCliWorkspace(p,result);storage.setItem(STORAGE_KEY,JSON.stringify(later.data));
 assert.equal(await storage.flush(),false);assert.equal(writes.length,0);
 fail=false;assert.equal(await storage.flush(),true);assert.deepEqual(writes,[['receipt','dark',rid],['normal','light']]);
 assert.equal(storage.getStatus().pending,false);
 const recorded=applyWorkspaceEdit(d,()=>({...d,tasks:[newTask('a')]}),{id:rid,at:now.toISOString(),source:'device',session:'test',trigger:'event'},{allowAutomation:false,rules:[]});
 assert.equal(recorded.tasks[0].activity[0].operation,rid);
});
