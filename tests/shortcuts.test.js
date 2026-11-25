import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,chord,validBinding,loadShortcuts,shortcutAction,SHORTCUT_KEY} from '../src/core/shortcuts.js';
const event=(key,extra={})=>({key,...extra});
test('default bindings and platform modifier equivalence',()=>{
 const b=defaults();
 for(const id of Object.keys(b))assert.equal(validBinding(id,b[id],b),'');
 assert.equal(chord(event('k',{ctrlKey:true})),'Mod+K');
 assert.equal(chord(event('k',{metaKey:true})),'Mod+K');
 assert.equal(shortcutAction(event('k',{metaKey:true}),b,'global'),'command');
 assert.equal(shortcutAction(event('m'),b,'task'),'tomorrow');
 assert.equal(shortcutAction(event('m'),b,'global'),undefined);
 assert.equal(chord(event('m',{isComposing:true})),'');
});
test('conflict, reserved keys and global modifier validation',()=>{
 const b=defaults();
 assert.match(validBinding('rename','T',b),/冲突/);
 assert.match(validBinding('search','F3',b),/Ctrl/);
 assert.match(validBinding('command','Mod+C',b),/保留/);
 assert.equal(chord(event('Escape')),'');
 assert.equal(validBinding('rename','F3',b),'');
});
test('load saved edits and disabled actions; reject invalid configuration',()=>{
 const b={...defaults(),rename:'F3',today:''};
 assert.deepEqual(loadShortcuts({getItem:key=>key===SHORTCUT_KEY?JSON.stringify(b):null}),b);
 assert.deepEqual(loadShortcuts({getItem:()=>JSON.stringify({...b,rename:'M'})}),defaults());
 assert.deepEqual(loadShortcuts({getItem:()=>'{'}),defaults());
});
