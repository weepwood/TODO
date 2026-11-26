import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alarmNotification} from '../src/platform/android/reminder-plan.js';


test('Android 调度保存可反序列化的原生请求，仅包含通用通知内容',()=>{
 const request=alarmNotification(1000000042,Date.parse("2026-11-25T13:00:00Z"));
 const {sourceJson,...expected}=request;
 assert.deepEqual(JSON.parse(sourceJson),expected);
 assert.equal(expected.schedule.at.date,'2026-11-25T13:00:00.000Z');
 assert.equal(expected.schedule.at.allowWhileIdle,true);
 assert.equal(expected.schedule.at.repeating,false);
 assert.deepEqual(Object.keys(expected).sort(),['actionTypeId','body','id','schedule','title']);
 assert.throws(()=>alarmNotification(1,0),/无效/);
 assert.throws(()=>alarmNotification(1000000042,NaN),/无效/);
});
