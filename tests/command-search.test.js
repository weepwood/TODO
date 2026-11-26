import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankCommands,readRecentCommands,rememberCommand} from '../src/command-search.js';
test('命令精确匹配优先、非连续字符、多词及最近使用',()=>{
 const entries=[{id:'a',name:'打开每日规划'},{id:'b',name:'每日规划'},{id:'c',name:'项目文档整理',keywords:'工作 收集箱'}];
 assert.equal(rankCommands(entries,'每日规划')[0].id,'b');assert.deepEqual(rankCommands(entries,'项文 工作').map(x=>x.id),['c']);
 assert.deepEqual(rankCommands(entries,'不存在'),[]);assert.equal(rankCommands(entries,'',60,['c'])[0].id,'c');
 const m=new Map(),storage={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};
 assert.deepEqual(rememberCommand(storage,entries[1],['a','b']),['b','a']);assert.deepEqual(readRecentCommands(storage),['b','a']);
});

test('命令范围分类互斥并保留排序输入',async()=>{
 const {scopeCommands}=await import('../src/command-search.js');
 const entries=[{id:'task:a',name:'工作',kind:'task'},{id:'list:a',name:'打开 工作'},{id:'smart:b',name:'打开 今日'},{id:'view:today',name:'打开 今天'},{id:'module:tasks',name:'打开 任务'},{name:'设置'}];
 assert.deepEqual(scopeCommands(entries,'task').map(e=>e.id),['task:a']);
 assert.deepEqual(scopeCommands(entries,'list').map(e=>e.id),['list:a','smart:b','view:today']);
 assert.equal(scopeCommands(entries,'command').length,2);
 assert.equal(scopeCommands(entries,'all'),entries);
});

test('空查询快速路径保持稳定最近使用和重复ID顺序',()=>{
 const entries=Array.from({length:10000},(_,i)=>({id:'task:'+i,name:'任务 '+i}));entries.push({...entries[9999],name:'重复项'});
 assert.deepEqual(rankCommands(entries,'',4,['task:9999','task:3','missing']).map(e=>e.name),['任务 9999','重复项','任务 3','任务 0']);
 assert.deepEqual(rankCommands(entries,'　',2),entries.slice(0,2));
});
