import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectPlatform} from '../src/platform/capabilities.js';
import {subscribeSyncWake} from '../src/platform/web/sync-wake.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const json=p=>JSON.parse(read(p));
test('跨平台能力声明：原生移动端不使用桌面窗口、托盘与快捷键',()=>{
 assert.equal(detectPlatform(false,'Android').kind,'web');
 assert.equal(detectPlatform(true,'Windows NT').desktop,true);
 const a=detectPlatform(true,'Android 14; Mobile');assert.equal(a.kind,'android');
 assert.equal(a.independentCapture,false);assert.equal(a.globalShortcut,false);assert.equal(a.backgroundSync,false);assert.equal(a.scheduledMobileReminder,false);
 assert.equal(detectPlatform(true,'iPhone').kind,'ios');
});
test('Android 单窗口配置与桌面专属权限隔离，保留共享存储命令',()=>{
 const android=json('src-tauri/tauri.android.conf.json');
 assert.deepEqual(android.app.windows.map(w=>w.label),['main']);
 assert.equal(android.bundle.android.minSdkVersion,26);
 const main=json('src-tauri/capabilities/default.json');
 for(const n of ['native-load-store','native-write-store','native-notify','native-test-notification','native-activate'])assert(main.permissions.includes('allow-'+n));
 for(const f of ['capture','desktop-main']){const c=json('src-tauri/capabilities/'+f+'.json');assert.deepEqual(new Set(c.platforms),new Set(['linux','macOS','windows']));assert(!c.platforms.includes('android'))}
 assert(!main.permissions.some(x=>/capture|shortcut|native-exit|native-direct/.test(x)));
});
test('移动端回前台触发同步，后台跳过轮询并正确清理监听',()=>{
 const win=new EventTarget(),doc=new EventTarget();doc.visibilityState='hidden';let tick,calls=0,cleared=false;
 win.setInterval=fn=>{tick=fn;return 1};win.clearInterval=()=>{cleared=true};
 const stop=subscribeSyncWake(()=>calls++,{win,doc,foregroundOnly:true});
 tick();win.dispatchEvent(new Event('online'));assert.equal(calls,0);
 doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));assert.equal(calls,1);
 win.dispatchEvent(new Event('focus'));assert.equal(calls,2);stop();assert(cleared);win.dispatchEvent(new Event('online'));assert.equal(calls,2);
});

import {requireMobileNotificationPermission} from '../src/platform/android/notifications.js';
test('移动提醒不自动弹出授权，只有显式测试操作可申请权限',async()=>{
 const calls=[],invoke=async c=>{calls.push(c);return c.endsWith('request_permission')?'granted':false};
 await assert.rejects(requireMobileNotificationPermission(invoke),/通知权限/);
 assert.deepEqual(calls,['plugin:notification|is_permission_granted']);
 await requireMobileNotificationPermission(invoke,{request:true});
 assert.equal(calls.at(-1),'plugin:notification|request_permission');
 await assert.rejects(requireMobileNotificationPermission(async()=>false,{request:true}),/通知权限/);
});
