import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';

const pkg='com.weepwood.todo.qa.runtime';
const out='android-runtime';
const title='Native Android QA';
const vaultKey='todo-android-auth-v1-code-verifier';
const sentinel='synthetic-vault-probe-'+Date.now();
const reports=[];
mkdirSync(out,{recursive:true});
const adb=(...args)=>execFileSync('adb',args,{encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024}).trim();
const raw=(...args)=>execFileSync('adb',args,{timeout:30000,maxBuffer:16*1024*1024});
const pass=name=>{reports.push({name,status:'pass'});console.log('PASS: '+name)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function retry(fn,ms=60000){
 const end=Date.now()+ms;let error;
 while(Date.now()<end){try{return await fn()}catch(e){error=e;await sleep(500)}}
 throw error||Error('timeout');
}
async function connect(){
 const socket=await retry(()=>{
  const pid=adb('shell','pidof',pkg).split(/\s+/)[0];
  assert.match(pid,/^\d+$/);
  const line=adb('shell','cat','/proc/net/unix').split('\n').find(l=>l.endsWith('@webview_devtools_remote_'+pid));
  assert.ok(line,'debug WebView socket not ready');
  return 'webview_devtools_remote_'+pid;
 });
 adb('forward','tcp:9222','localabstract:'+socket);
 const browser=await retry(()=>chromium.connectOverCDP('http://127.0.0.1:9222',{timeout:5000}));
 const page=await retry(()=>{const p=browser.contexts().flatMap(c=>c.pages()).find(p=>!p.url().startsWith('devtools:'));assert.ok(p,'no WebView page');return p});
 await expect(page.locator('.native-mobile')).toBeVisible({timeout:60000});
 await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible({timeout:30000});
 return {browser,page};
}
function launch(){
 const component=adb('shell','cmd','package','resolve-activity','--brief','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER',pkg).split('\n').at(-1);
 assert.ok(component?.startsWith(pkg+'/'),'unexpected launcher: '+component);
 const result=adb('shell','am','start','-W','-n',component);
 assert.ok(!/Error:|Exception/.test(result),result);
}
const screenshot=name=>writeFileSync(out+'/'+name+'.png',raw('exec-out','screencap','-p'));
const invoke=(page,cmd,args={})=>page.evaluate(({cmd,args})=>window.__TAURI_INTERNALS__.invoke(cmd,args),{cmd,args});
async function store(page){
 const value=await invoke(page,'native_load_store',{scope:'guest'});
 return JSON.parse(JSON.parse(value)['todo-workbench-v1']);
}
let browser,page;
try{
 adb('install','-t',out+'/qa.apk');
 adb('shell','input','keyevent','82');
 launch();
 ({browser,page}=await connect());
 pass('APK install, Activity launch, real native WebView and mobile shell');
 await expect(page.locator('.mobile-nav button')).toHaveCount(5);
 await page.getByRole('textbox',{name:'新任务名称'}).fill(title+' 积分+10');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 await retry(async()=>{const s=await store(page);assert.equal(s.tasks.filter(t=>t.title===title&&t.points===10).length,1)});
 pass('UI task creation, signed points and real SQLite IPC');
 screenshot('01-task-created');
 await page.locator('.task-body').filter({hasText:title}).click();
 await expect(page.locator('.details')).toBeVisible();
 adb('shell','input','keyevent','4');
 await expect(page.locator('.details')).toHaveCount(0,{timeout:10000});
 pass('Android system Back closes detail through native bridge');
 await assert.rejects(invoke(page,'native_shortcut_status'));
 pass('desktop-only IPC denied by native ACL');
 await invoke(page,'plugin:todo-mobile|session_write',{key:vaultKey,value:sentinel});
 assert.deepEqual(await invoke(page,'plugin:todo-mobile|session_read',{key:vaultKey}),{value:sentinel});
 const encrypted=raw('exec-out','run-as',pkg,'cat','no_backup/todo-mobile-v1/'+vaultKey);
 assert.ok(encrypted.length>=29&&encrypted[0]===1);
 assert.equal(encrypted.includes(Buffer.from(sentinel)),false);
 await assert.rejects(invoke(page,'plugin:todo-mobile|session_read',{key:'unapproved-key'}));
 pass('Android Keystore encrypted session file and fixed-key restriction');
 adb('shell','am','force-stop',pkg);
 await browser.close().catch(()=>{});
 browser=null;
 adb('forward','--remove','tcp:9222');
 launch();
 ({browser,page}=await connect());
 assert.equal((await store(page)).tasks.filter(t=>t.title===title&&t.points===10).length,1);
 await expect(page.locator('.task-body').filter({hasText:title})).toBeVisible();
 assert.deepEqual(await invoke(page,'plugin:todo-mobile|session_read',{key:vaultKey}),{value:sentinel});
 await invoke(page,'plugin:todo-mobile|session_remove',{key:vaultKey});
 assert.deepEqual(await invoke(page,'plugin:todo-mobile|session_read',{key:vaultKey}),{value:null});
 pass('force-stop/relaunch preserves SQLite task and encrypted session; removal works');
 adb('shell','pm','grant',pkg,'android.permission.POST_NOTIFICATIONS');
 assert.equal(await invoke(page,'plugin:notification|is_permission_granted'),true);
 await invoke(page,'native_test_notification');
 await retry(()=>{const dump=adb('shell','dumpsys','notification');assert.ok(dump.split('\n').some(line=>line.includes('NotificationRecord')&&line.includes(pkg)),'no OS notification record')},20000);
 pass('native notification permission and Android system notification record');
 const id=1000000042;
 const accepted=await invoke(page,'plugin:notification|batch',{notifications:[{id,title:'TODO Runtime QA',body:'Synthetic alarm',schedule:{at:{date:new Date(Date.now()+600000).toISOString(),repeating:false,allowWhileIdle:true}}}]});
 assert.ok(Array.isArray(accepted)&&accepted.includes(id));
 await retry(async()=>assert.ok((await invoke(page,'plugin:notification|get_pending')).some(r=>r.id===id)));
 await invoke(page,'plugin:notification|cancel',{notifications:[id]});
 await retry(async()=>assert.ok(!(await invoke(page,'plugin:notification|get_pending')).some(r=>r.id===id)));
 pass('native notification schedule accepted, pending list and cancellation');
 screenshot('02-restored');
 writeFileSync(out+'/result.json',JSON.stringify({status:'pass',reports,limitations:['x86_64 emulator, not ARM64 physical device','no authenticated cloud or WorkManager network test','alarm delivery, reboot and Doze not tested']},null,2));
}catch(e){
 writeFileSync(out+'/result.json',JSON.stringify({status:'fail',reports,error:String(e)},null,2));
 try{screenshot('failure')}catch{}
 try{writeFileSync(out+'/android-runtime-log.txt',adb('logcat','-d','-s','AndroidRuntime:E'))}catch{}
 throw e;
}finally{
 await browser?.close().catch(()=>{});
 try{adb('forward','--remove','tcp:9222')}catch{}
}
