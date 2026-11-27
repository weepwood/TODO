// Research-only; runs exact original signed packages on a disposable hosted Windows account.
// No real account, production data, source rebuild, updater feed, or signature secrets.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {chromium} from '@playwright/test';
assert(process.platform==='win32'&&process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Windows');
assert.equal(process.env.GITHUB_REF,'refs/heads/research/signed-upgrade-20261127');
const temp=process.env.RUNNER_TEMP,appData=process.env.APPDATA;
assert(temp&&appData);
const install=join(temp,'todo-signed-overlay-qa'),data=join(appData,'com.weepwood.todo'),db=join(data,'todo.sqlite3');
assert(!existsSync(install)&&!existsSync(data),'Refuse any preexisting installation or workspace');
assert(!/\s/.test(install),'NSIS /D path must be unambiguous');
const evidence=resolve('signed-upgrade-evidence');mkdirSync(evidence,{recursive:true});
const report={phase:'start',tests:[],candidate:'18450487a437c37a836d0ba1a84d642c38daca93',old:'980df78089e6b2628d4f2903373f41d35579ca4e'};
const save=()=>writeFileSync(join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
const pass=(name,details={})=>{report.tests.push({name,...details});save();console.log('PASS '+name)};
const decode=s=>Buffer.from(s.trim(),'base64');
const lines=s=>decode(s).toString('utf8').trimEnd().split(/\r?\n/);
const keyLines=lines(process.env.TODO_VERIFY_PUBLIC_KEY||''),raw=decode(keyLines[1]||'');
assert.equal(raw.length,42);assert.equal(raw.subarray(0,2).toString(),'Ed');
const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw.subarray(10)]),format:'der',type:'spki'});
const hash=x=>createHash('sha256').update(x).digest('hex');
const versions=['1.2.0-alpha.1','1.2.0-alpha.2'];
const packages=versions.map((v,i)=>{
 const dir=join(temp,'todo-original-alpha.'+(i+1)),name='TODO_'+v+'_x64-setup.exe',p=join(dir,name);
 const checks=readFileSync(join(dir,'SHA256SUMS.txt'),'utf8').trim().split(/\r?\n/).map(l=>l.match(/^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/));
 assert(checks.every(Boolean));const map=new Map(checks.map(m=>[m[2],m[1]]));assert.equal(map.size,checks.length);
 for(const n of ['BUILD_COMMIT.txt',name,name+'.sig'])assert.equal(hash(readFileSync(join(dir,n))),map.get(n));
 assert.equal(readFileSync(join(dir,'BUILD_COMMIT.txt'),'utf8').trim(),i?report.candidate:report.old);
 const bytes=readFileSync(p),[untrusted,sig,comment,global]=lines(readFileSync(p+'.sig','utf8')),record=decode(sig);
 assert(untrusted.startsWith('untrusted comment:')&&comment.startsWith('trusted comment: '));
 assert.equal(record.length,74);assert.equal(record.subarray(0,2).toString(),'ED');assert(record.subarray(2,10).equals(raw.subarray(2,10)));
 const signature=record.subarray(10);
 assert(verify(null,createHash('blake2b512').update(bytes).digest(),key,signature));
 assert(verify(null,Buffer.concat([signature,Buffer.from(comment.slice(17))]),key,decode(global)));
 pass('exact original package and updater signature '+v,{sha256:hash(bytes)});
 return p;
});
const executable=join(install,'todo.exe'),port=9238;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=60000){const end=Date.now()+ms;let err;while(Date.now()<end){try{const r=await fn();if(r)return r}catch(e){err=e}await pause(400)}throw Error('Timed out: '+(err?.message||'condition'))}
function installPackage(p){const r=spawnSync(p,['/S','/D='+install],{timeout:180000,windowsHide:true,stdio:'inherit'});assert.equal(r.status,0,'NSIS installer failed');assert(existsSync(executable),'Expected installed exe absent')}
function readDb(){
 const c=new DatabaseSync(db,{readOnly:true});
 try{
  const integrity=c.prepare('PRAGMA integrity_check').all();assert.deepEqual(integrity.map(x=>x.integrity_check),['ok']);
  const rows=c.prepare('SELECT scope,body FROM workspace_store ORDER BY scope').all();
  assert(rows.every(x=>x.scope==='guest'),'Unexpected account scope');
  const store=JSON.parse(rows.find(x=>x.scope==='guest').body);
  const body=JSON.parse(store['todo-workbench-v1']);
  const snapshot=c.prepare("SELECT body FROM snapshots WHERE scope='guest'").get();
  assert.deepEqual(JSON.parse(snapshot.body),body);
  const backups=c.prepare("SELECT body FROM backups WHERE scope='guest'").all().map(x=>JSON.parse(x.body));
  return {body,backups};
 }finally{c.close()}
}
let child,browser,page;
async function start(v){
 assert(!child||child.exitCode!==null,'Previous app still running');
 child=spawn(executable,[],{env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port='+port+' --remote-debugging-address=127.0.0.1'},stdio:'ignore'});
 child.on('error',e=>console.error('App spawn:',e.message));
 await until(async()=>{assert(child.exitCode===null,'App exited');const r=await fetch('http://127.0.0.1:'+port+'/json/version');return r.ok});
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
 page=await until(()=>browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('http://tauri.localhost/')&&!p.url().includes('capture.html')));
 await page.getByRole('textbox',{name:'新任务名称'}).waitFor({timeout:60000});
 const version=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:app|version'));
 assert.equal(version,v);
 assert(await page.evaluate(()=>!!window.__TAURI_INTERNALS__?.invoke),'Native IPC absent');
 pass('installed real WebView and native app version '+v);
}
async function stop(){
 if(page&&!page.isClosed())await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('native_exit')).catch(()=>{});
 await until(()=>child.exitCode!==null,20000);
 assert.equal(child.exitCode,0,'Native exit was not clean');
 await browser?.close().catch(()=>{});browser=null;page=null;
 await until(async()=>{try{await fetch('http://127.0.0.1:'+port+'/json/version');return false}catch{return true}},15000);
}
const title='QA signed upgrade retained 1845048',second='QA post-upgrade write 1845048';
const find=(state,t)=>state.body.tasks.find(x=>x.title===t);
try{
 report.phase='old-install';save();installPackage(packages[0]);await start(versions[0]);
 const input=page.getByRole('textbox',{name:'新任务名称'});await input.fill(title);await page.getByRole('button',{name:'添加',exact:true}).click();
 await page.locator('.task-body').filter({hasText:title}).waitFor();
 const old=await until(()=>{const x=readDb();return find(x,title)?x:null});
 const task=find(old,title);assert(task.id);assert.equal(old.body.tasks.filter(t=>t.title===title).length,1);
 await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('native_create_backup',{scope:'guest'}));
 await until(()=>readDb().backups.some(b=>b.tasks.some(t=>t.id===task.id)));
 pass('old version real UI write committed to SQLite and backup',{id:task.id});
 await page.screenshot({path:join(evidence,'old.png')});
 await stop();
 const before=readDb();assert.deepEqual(find(before,title),task);
 report.phase='overlay';save();installPackage(packages[1]);assert(existsSync(db),'Installer removed existing database');
 const preserved=readDb();assert.deepEqual(find(preserved,title),task);assert(preserved.backups.some(b=>b.tasks.some(t=>t.id===task.id)));
 pass('overlay installer preserves original SQLite snapshot and backup');
 await start(versions[1]);await page.locator('.task-body').filter({hasText:title}).waitFor();
 const after=readDb();assert.deepEqual(find(after,title),task);assert.equal(after.body.tasks.filter(t=>t.id===task.id).length,1);
 await page.getByRole('textbox',{name:'新任务名称'}).fill(second);await page.getByRole('button',{name:'添加',exact:true}).click();
 await until(()=>{const x=readDb();return find(x,second)&&find(x,title)?.id===task.id});
 await page.screenshot({path:join(evidence,'new.png')});await stop();
 const final=readDb();assert.deepEqual(find(final,title),task);assert(find(final,second));
 pass('new version displays old task, saves new task, preserves SQLite and backup after exit');
 report.phase='passed';save();
}catch(e){
 report.phase='failed';report.error=String(e);save();
 if(page&&!page.isClosed())await page.screenshot({path:join(evidence,'failure.png')}).catch(()=>{});
 throw e;
}finally{
 // This process was created on a disposable hosted runner; never stop other app instances.
 if(child&&child.exitCode===null)child.kill();
 await browser?.close().catch(()=>{});
}
