import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY} from '../src/domain.js';
import {splitSnapshot,joinSnapshot,diffParts,makeRecovery,parseRecovery,semanticDigest} from '../src/services/web-workspace-shards.js';
const values=n=>({[STORAGE_KEY]:JSON.stringify({...initialState(),tasks:Array.from({length:n},(_,i)=>newTask('task '+i,'inbox','','id-'+i))}),[BACKUP_KEY]:'original backup'});
test('分片往返保留未知字段、顺序、备份及语义摘要',async()=>{
 const v=values(300),state=JSON.parse(v[STORAGE_KEY]);state.futureField={a:3};v[STORAGE_KEY]=JSON.stringify(state);
 const restored=joinSnapshot(splitSnapshot(v));assert.deepEqual(JSON.parse(restored[STORAGE_KEY]),state);assert.equal(restored[BACKUP_KEY],v[BACKUP_KEY]);assert.equal(await semanticDigest(restored),await semanticDigest(v));
});
test('单任务修改只改变一个分片，重排只改变顺序',()=>{
 const v=values(300),before=splitSnapshot(v),state=JSON.parse(v[STORAGE_KEY]);state.tasks[17].title+=' changed';
 const delta=diffParts(before,splitSnapshot({...v,[STORAGE_KEY]:JSON.stringify(state)}));assert.equal(delta.put.length,1);assert.match(delta.put[0][0],/^task:/);assert.equal(delta.remove.length,0);
 state.tasks[17].title='task 17';state.tasks.reverse();assert.deepEqual(diffParts(before,splitSnapshot({...v,[STORAGE_KEY]:JSON.stringify(state)})).put.map(x=>x[0]),['order']);
});
test('缺失或重复分片拒绝重建，恢复文件拒绝篡改与跨账号',async()=>{
 const v=values(10),parts=splitSnapshot(v);parts.delete([...parts.keys()].find(k=>k.startsWith('task:')));assert.throws(()=>joinSnapshot(parts),/不完整/);
 const file=await makeRecovery('guest',v);assert.equal((await parseRecovery(JSON.stringify(file),'guest')).count,10);await assert.rejects(parseRecovery(JSON.stringify(file),'account:synthetic-a'),/作用域/);
 file.values[BACKUP_KEY]='changed';await assert.rejects(parseRecovery(JSON.stringify(file),'guest'),/摘要/);
 await assert.rejects(makeRecovery('account:real-user',v),/合成/);
});
