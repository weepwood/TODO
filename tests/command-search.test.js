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
