import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../src-tauri/'+p,import.meta.url),'utf8');
test('所有 Rust IPC 命令显式注册，录入窗口不得访问工作空间',()=>{
 const commands=[...read('src/lib.rs').matchAll(/#\[tauri::command\]\s*fn (native_\w+)\(/g)].map(m=>m[1]);
 const manifest=[...read('build.rs').matchAll(/"(native_\w+)"/g)].map(m=>m[1]);
 assert.deepEqual(new Set(commands),new Set(manifest));
 const main=JSON.parse(read('capabilities/default.json')),capture=JSON.parse(read('capabilities/capture.json')),desktop=JSON.parse(read('capabilities/desktop-main.json'));
 assert.deepEqual(main.windows,['main']);assert.deepEqual(capture.windows,['capture']);
 assert.deepEqual(capture.permissions.sort(),['allow-native-capture-cancel','allow-native-capture-generation','allow-native-capture-handoff','allow-native-capture-submit-direct','allow-native-capture-direct-status','core:event:allow-listen','core:event:allow-unlisten'].sort());
 assert.deepEqual(new Set([...main.permissions,...desktop.permissions,...capture.permissions].map(p=>typeof p==='string'?p:p.identifier).filter(p=>p.startsWith('allow-native-'))),new Set(commands.map(c=>'allow-'+c.replaceAll('_','-'))));
 assert(!capture.permissions.some(p=>[...main.permissions,...desktop.permissions].includes(p)));
 const opener=main.permissions.filter(p=>typeof p==='object'&&p.identifier.startsWith('opener:'));
 assert.deepEqual(opener,[{identifier:'opener:allow-open-url',allow:[{url:'https://xepkhnatnpvopnlqnrrz.supabase.co/auth/v1/authorize[?]*'}]}]);
 assert(![...desktop.permissions,...capture.permissions].some(p=>(typeof p==='string'?p:p.identifier).startsWith('opener:')));
 const win=JSON.parse(read('tauri.conf.json')).app.windows.find(w=>w.label==='capture');
 assert.equal(win.incognito,true);assert.equal(win.visible,false);assert.equal(win.url,'capture.html');
});
