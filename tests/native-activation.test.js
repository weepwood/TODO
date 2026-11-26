import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeActivationCoordinator} from '../src/services/native-activation.js';
import {createNativeStore} from '../src/services/native-store.js';
test('原生激活中的旧账户与延迟清理不能覆盖新账户',async()=>{
 let unblock,entered;const calls=[],started=new Promise(r=>entered=r);
 const coordinator=createNativeActivationCoordinator(async(_cmd,{scope})=>{calls.push(scope);if(scope==='old'){entered();await new Promise(resolve=>unblock=resolve)}});
 const a=coordinator.claim('old');assert.equal(await a.ready,true);const first=a.activate();await started;
 const cleanup=a.release(),b=coordinator.claim('new'),second=b.activate();unblock();
 assert.equal(await first,false);assert.equal(await cleanup,false);assert.equal(await second,true);assert.deepEqual(calls,[null,'old',null,'new']);
 assert.equal(await a.release(),false);assert.equal(await b.release(),true);assert.deepEqual(calls,[null,'old',null,'new',null]);
});
test('原生旧作用域尚未激活时直接放弃且失败不阻塞新租约',async()=>{
 const calls=[],coordinator=createNativeActivationCoordinator(async(_cmd,{scope})=>{calls.push(scope);if(scope==='bad')throw Error('activation')});
 const a=coordinator.claim('old'),first=a.activate(),b=coordinator.claim('bad');
 assert.equal(await first,false);await assert.rejects(b.activate(),/activation/);
 const c=coordinator.claim('new');assert.equal(await c.activate(),true);assert.deepEqual(calls,[null,'bad',null,'new']);
});
test('新账号读取失败之前已清除旧原生活动范围',async()=>{
 const calls=[],coordinator=createNativeActivationCoordinator(async(_cmd,{scope})=>calls.push(scope));
 const a=coordinator.claim('old');await a.activate();const b=coordinator.claim('new');
 assert.equal(await b.ready,true);assert.deepEqual(calls,[null,'old',null]);assert.equal(a.current(),false);
});
test('原生失败状态回调内重试的等待者不被前一事务错误结算',async()=>{
 let attempt=0,retry,store;
 store=createNativeStore({'todo-workbench-v1':'old'},async()=>{if(++attempt===1)throw Error('disk')},status=>{if(status.error&&!retry)retry=store.flush()});
 store.setItem('todo-workbench-v1','new');assert.equal(await store.flush(),false);assert.equal(await retry,true);assert.equal(attempt,2);
});
