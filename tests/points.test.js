import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask,migrateState,completeTask,reopenTask,duplicateTask,dayKey,shiftDay} from '../src/domain.js';
import {summarizePoints,taskPoints,validPoints} from '../src/points.js';
import {quickParse} from '../src/advanced.js';
import {mergeTasks} from '../src/sync-merge.js';
const today=dayKey(),yesterday=shiftDay(today,-1);
const done=(name,points,date=today,list='inbox')=>({...newTask(name,list),points,status:'completed',stage:'done',completedAt:new Date(date+'T12:00:00').toISOString()});
test('正负积分、日期清单过滤、未完成/跳过/回收站排除及累计',()=>{
 const tasks=[done('正',10),done('负',-4),done('旧',8,shiftDay(today,-40)),done('其他',3,today,'work'),done('未来',99,shiftDay(today,1)),{...done('删除',99),deletedAt:'x'},{...done('跳过',99),status:'skipped'},{...newTask('待办'),points:99},done('零',0)];
 const s=summarizePoints(tasks,{since:yesterday,today,list:'inbox'});
 assert.deepEqual(s.period,{positive:10,negative:-4,net:6,count:2});
 assert.equal(s.total.net,14);assert.equal(s.daily.get(today).net,6);assert.equal(s.byList.get('inbox').net,6);assert.equal(s.entries.length,2);
 assert.equal(summarizePoints(tasks,{since:yesterday,today,list:'all'}).period.net,9);
});
test('旧数据无积分字段不改写，非法值拒绝，快捷解析保留未识别文本',()=>{
 const s=initialState();s.tasks=[newTask('旧任务')];assert.deepEqual(migrateState(s),s);assert.equal(taskPoints(s.tasks[0]),0);
 for(const p of [null,'10',1.5,100000,-100000,Infinity]){assert.equal(validPoints(p),false);assert.throws(()=>migrateState({...s,tasks:[{...s.tasks[0],points:p}]}),/积分/)}
 assert.equal(quickParse('阅读 明天 积分+10',today).points,10);
 assert.deepEqual(quickParse('熬夜 积分-5',today),{title:'熬夜',date:'',time:'',priority:0,points:-5});
 assert.equal(quickParse('超限 积分+100000',today).title,'超限 积分+100000');
});
test('完成/撤销/重复任务及复制积分，独立字段同步合并',()=>{
 const s=initialState(),t={...newTask('任务'),points:-5};s.tasks=[t];
 let tasks=completeTask(s.tasks,t.id,today);assert.equal(summarizePoints(tasks,{since:today,today}).period.net,-5);
 assert.equal(summarizePoints(completeTask(tasks,t.id,today),{since:today,today}).period.net,-5);
 tasks=reopenTask(tasks,t.id);assert.equal(summarizePoints(tasks,{since:today,today}).period.net,0);
 assert.equal(duplicateTask(t,s.lists,s.tags).points,-5);
 const recurring={...newTask('每日','inbox',today),repeat:'daily',points:10};const next=completeTask([recurring],recurring.id,today);assert.equal(next.length,2);assert.equal(next[1].points,10);assert.equal(summarizePoints(next,{since:today,today}).period.net,10);
 const local={...s,tasks:[{...t,points:8}]},remote={...s,tasks:[{...t,title:'新标题'}]};assert.equal(mergeTasks(s,local,remote).tasks[0].points,8);
});
