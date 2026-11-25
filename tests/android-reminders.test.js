import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planAlarms,reminderKey,MAX_ALARMS} from '../src/platform/android/reminder-plan.js';
import {mobileBackAction} from '../src/platform/android/lifecycle.js';
const now=Date.parse('2026-11-25T12:00:00Z'),later='2026-11-25T13:00:00Z';
const task=(id,at=later)=>({id,status:'pending',reminderAt:at,extraReminders:[]});
test('调度只选择未来有效任务，去重且限制数量和范围',()=>{
 const tasks=[task('a'),{...task('a'),extraReminders:[{at:later}]},{...task('b'),status:'completed'},{...task('c'),deletedAt:'yes'},{...task('d'),remindedAt:later},task('far','2027-12-25T13:00:00Z'),task('bad','invalid')];
 assert.deepEqual(planAlarms(tasks,'guest',now).map(r=>r.key),[reminderKey('guest','a',later)]);
 assert.equal(planAlarms(Array.from({length:300},(_,i)=>task('t'+i)),'guest',now).length,MAX_ALARMS);
});
test('改期、完成、删除、账号切换与过期取消；保留刚到期已提交闹钟',()=>{
 const prior={key:reminderKey('guest','a',later),scope:'guest',epoch:Date.parse(later),id:1000000000,accepted:true};
 assert.deepEqual(planAlarms([task('a','2026-11-25T14:00:00Z')],'guest',now,[prior]).map(r=>r.key),[reminderKey('guest','a','2026-11-25T14:00:00Z')]);
 assert.equal(planAlarms([{...task('a'),status:'completed'}],'guest',now,[prior]).length,0);
 assert.equal(planAlarms([task('a')],'other',now+7200000,[prior]).length,0);
 assert.deepEqual(planAlarms([{...task('a'),remindedAt:later}],'guest',now+7200000,[prior]),[prior]);
 assert.equal(planAlarms([task('a')],'guest',now+3*86400000,[prior]).length,0);
});
test('移动返回优先关闭浮层和详情，不直接丢弃工作空间',()=>{
 const base={modal:false,detail:false,sidebar:false,module:'tasks',view:'today'};
 assert.equal(mobileBackAction({...base,modal:true,detail:true}),'modal');
 assert.equal(mobileBackAction({...base,detail:true,sidebar:true}),'detail');
 assert.equal(mobileBackAction({...base,sidebar:true}),'sidebar');
 assert.equal(mobileBackAction({...base,module:'calendar'}),'today');
 assert.equal(mobileBackAction(base),'root');
});

import {createAndroidSessionStorage,ANDROID_SESSION_KEY,resetAndroidSession} from '../src/platform/android/session-storage.js';
import {revisionIntent} from '../src/platform/android/revision-intent.js';
import {digest} from '../src/services/cloud-core.js';
test('Android 会话仅经受限原生接口读写，失败不回退明文',async()=>{
 const values=new Map(),calls=[];
 const adapter=createAndroidSessionStorage(async(cmd,args)=>{calls.push(cmd);if(cmd.endsWith('session_read'))return {value:values.get(args.key)??null};if(cmd.endsWith('session_write'))values.set(args.key,args.value);if(cmd.endsWith('session_remove'))values.delete(args.key)});
 assert.equal(await adapter.getItem(ANDROID_SESSION_KEY),null);await adapter.setItem(ANDROID_SESSION_KEY,'synthetic-session');assert.equal(await adapter.getItem(ANDROID_SESSION_KEY),'synthetic-session');
 await assert.rejects(adapter.getItem('unknown'),/存储键/);
 await resetAndroidSession(async(cmd,args)=>{assert(cmd.endsWith('session_remove'));values.delete(args.key)});assert.equal(values.size,0);
 await assert.rejects(createAndroidSessionStorage(async()=>null).getItem(ANDROID_SESSION_KEY),/安全会话/);
 await assert.rejects(createAndroidSessionStorage(async()=>{throw Error('vault offline')}).setItem(ANDROID_SESSION_KEY,'synthetic'),/vault offline/);
});
test('后台版本检查只在已持久化状态生成，不含任务正文或会话',async()=>{
 const data={version:2,tasks:[{id:'a',title:'private test'}]},hash=await digest(data);
 const storage={flush:async()=>true,getItem:()=>JSON.stringify({revision:4,hash})};
 const intent=await revisionIntent({uid:'test-scope',storage,data,url:'https://example.supabase.co',key:'sb_publishable_test'});
 assert.deepEqual(intent,{scope:'test-scope',revision:4,dirty:false,url:'https://example.supabase.co',key:'sb_publishable_test'});
 assert.equal((await revisionIntent({uid:'test-scope',storage,data:{...data,tasks:[]},url:'https://example.supabase.co',key:'test'})).dirty,true);
 await assert.rejects(revisionIntent({uid:'test-scope',storage:{...storage,flush:async()=>false},data}),/保存失败/);
});
