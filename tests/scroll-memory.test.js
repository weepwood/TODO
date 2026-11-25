import test from 'node:test';
import assert from 'node:assert/strict';
import {readScrollMemory,rememberScroll,SCROLL_MEMORY_KEY} from '../src/core/scroll-memory.js';
test('scroll memory merges independent keys, bounds entries, rejects invalid values',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(rememberScroll(storage,'tasks',123.7),true);
 assert.equal(rememberScroll(storage,'planner',456),true);
 assert.deepEqual(readScrollMemory(storage),{tasks:124,planner:456});
 assert.equal(rememberScroll(storage,'bad',-1),false);
 for(let i=0;i<305;i++)rememberScroll(storage,'scope'+i,i);
 assert.equal(Object.keys(readScrollMemory(storage)).length,300);
 map.set(SCROLL_MEMORY_KEY,'{"tasks":-3,"calendar":100,"bad":"12"}');
 assert.deepEqual(readScrollMemory(storage),{calendar:100});
 assert.equal(rememberScroll({getItem:()=>null,setItem:()=>{throw Error('quota')}},'x',1),false);
});
