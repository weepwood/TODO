// Research-only; runs exact original signed packages on a disposable hosted Windows account.
// No real account, production data, source rebuild, updater feed, or signature secrets.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,createPublicKey,verify,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
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
// Pins were independently derived by comparing signed-run artifacts byte-for-byte
// to the previously validated release assets, not by trusting a new build.
const pins=JSON.parse(readFileSync(new URL('./signed-windows-upgrade-pins.json',import.meta.url),'utf8'));
assert.equal(pins.length,2);
const packages=versions.map((v,i)=>{
 const dir=join(temp,'todo-original-alpha.'+(i+1)),name='TODO_'+v+'_x64-setup.exe',p=join(dir,name);
 const pin=pins[i];
 assert.equal(pin.version,v);assert.equal(pin.sha,i?report.candidate:report.old);
 assert.deepEqual(Object.keys(pin.files).sort(),[name,name+'.sig'].sort());
 assert.deepEqual(readdirSync(dir).sort(),[name,name+'.sig'].sort());
 for(const [n,expected] of Object.entries(pin.files)) {
  assert(/^[a-f0-9]{64}$/.test(expected));assert.equal(hash(readFileSync(join(dir,n))),expected,'Original signed release hash mismatch: '+n);
 }
 const bytes=readFileSync(p),[untrusted,sig,comment,global]=lines(readFileSync(p+'.sig','utf8')),record=decode(sig);
 assert(untrusted.startsWith('untrusted comment:')&&comment.startsWith('trusted comment: '));
 assert.equal(record.length,74);assert.equal(record.subarray(0,2).toString(),'ED');assert(record.subarray(2,10).equals(raw.subarray(2,10)));
 const signature=record.subarray(10);
 assert(verify(null,createHash('blake2b512').update(bytes).digest(),key,signature));
 assert(verify(null,Buffer.concat([signature,Buffer.from(comment.slice(17))]),key,decode(global)));
 pass('exact original package and updater signature '+v,{sha256:hash(bytes),runId:pin.runId,artifactId:pin.artifactId});
 return p;
});
// A production WebView need not expose CDP. Exercise the supported local CLI
// queue and the actual installed GUI consumer; never write SQLite directly.
const executable=join(install,'todo.exe');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=60000){const end=Date.now()+ms;let err;while(Date.now()<end){try{const r=await fn();if(r)return r}catch(e){err=e}await pause(1000)}throw Error('Timed out: '+(err?.message||'condition'))}
function ps(command,extra={},timeout=20000){
 const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-STA','-Command',"$ErrorActionPreference='Stop'; "+command],{env:{...process.env,TODO_QA_EXE:executable,...extra},encoding:'utf8',timeout,windowsHide:true,maxBuffer:1024*1024});
 if(r.error||r.status!==0)throw Error('PowerShell diagnostic failed: '+(r.error?.message||r.stderr||r.status));
 return r.stdout.trim();
}
function processes(){
 const out=ps("ConvertTo-Json -Compress -InputObject @(Get-Process -Name todo -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:TODO_QA_EXE } | Select-Object Id,Path,MainWindowTitle,Responding)");
 return JSON.parse(out||'[]');
}
function installPackage(p){
 assert.equal(processes().length,0,'Existing test app must be stopped before installation');
 const r=spawnSync(p,['/S','/D='+install],{timeout:180000,windowsHide:true,stdio:'inherit'});
 assert.equal(r.status,0,'NSIS installer failed');assert(existsSync(executable),'Expected installed exe absent');
 const info=JSON.parse(ps("$v=(Get-Item -LiteralPath $env:TODO_QA_EXE).VersionInfo; ConvertTo-Json -Compress -InputObject @{ProductVersion=$v.ProductVersion;FileVersion=$v.FileVersion}"));
 return {hash:hash(readFileSync(executable)),...info};
}
function readDb(){
 const c=new DatabaseSync(db,{readOnly:true});
 try{
  c.exec('BEGIN');
  const integrity=c.prepare('PRAGMA integrity_check').all();assert.deepEqual(integrity.map(x=>x.integrity_check),['ok']);
  const rows=c.prepare('SELECT scope,body FROM workspace_store ORDER BY scope').all();
  assert(rows.length===1&&rows[0].scope==='guest','Expected only isolated guest workspace');
  const store=JSON.parse(rows[0].body),body=JSON.parse(store['todo-workbench-v1']);
  assert.equal(body.version,2);assert(Array.isArray(body.tasks));
  const snapshot=c.prepare("SELECT body FROM snapshots WHERE scope='guest'").get();assert.deepEqual(JSON.parse(snapshot.body),body);
  const backups=c.prepare("SELECT saved_at,body FROM backups WHERE scope='guest' ORDER BY saved_at").all().map(x=>({saved_at:x.saved_at,body:JSON.parse(x.body)}));
  return {body,backups};
 }finally{c.close()}
}
function cli(...args){
 const r=spawnSync(executable,['--cli','--data-dir',data,...args],{timeout:45000,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert(!r.error&&r.status===0,'CLI '+args[0]+' failed: '+(r.error?.message||r.stdout||r.stderr||r.status));
 // Windows GUI-subsystem stdout may be unavailable. Require the independent
 // committed queue and binding checks below even if the process emits no JSON.
 return r.stdout.trim()?JSON.parse(r.stdout):null;
}
function receipt(id){
 const c=new DatabaseSync(db,{readOnly:true});
 try{return c.prepare("SELECT d.status,m.task_count FROM direct_capture_requests d JOIN cli_capture_meta m ON d.scope=m.scope AND d.id=m.id WHERE d.scope='cli:guest' AND d.id=?").get(id)}finally{c.close()}
}
let child=null,activePid=null;
async function start(v,info){
 const existing=processes();assert(existing.length<=1,'Unexpected number of isolated app processes');
 if(!existing.length){
  const fd=openSync(join(evidence,v+'-app.log'),'a');
  try{child=spawn(executable,[],{env:process.env,stdio:['ignore',fd,fd]});child.on('error',e=>console.error('App spawn:',e.message))}finally{closeSync(fd)}
 }
 const proc=await until(()=>{const list=processes();assert(list.length<=1);return list[0]?.Responding?list[0]:null},30000);
 activePid=proc.Id;
 await until(()=>{assert(processes().some(p=>p.Id===activePid),'Installed GUI exited');return existsSync(db)&&readDb()},60000);
 pass('installed original native app initialized actual SQLite '+v,{...info,pid:activePid,windowTitle:proc.MainWindowTitle,installerAutoStarted:!!existing.length});
}
function inspectUI(title,label){
 // Read-only optional UI Automation verification; it does not turn a missing
 // accessibility tree into a failed product upgrade or a claimed UI pass.
 try{
  const result=JSON.parse(ps("Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes; $root=[System.Windows.Automation.AutomationElement]::RootElement; $scope=[System.Windows.Automation.TreeScope]::Children; $pidCondition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,[int]$env:TODO_QA_PID); $windows=$root.FindAll($scope,$pidCondition); $found=$false; foreach($w in $windows){ $cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$env:TODO_QA_TITLE); if($null -ne $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$cond)){$found=$true;break} }; ConvertTo-Json -Compress -InputObject @{found=$found;windows=$windows.Count}",{TODO_QA_PID:String(activePid),TODO_QA_TITLE:title},15000));
  report.ui??=[];report.ui.push({label,...result});save();console.log('UIA '+label+': '+JSON.stringify(result));
 }catch(e){report.ui??=[];report.ui.push({label,found:false,diagnostic:String(e)});save();console.log('UIA '+label+' unavailable; independent SQLite verification continues')}
}
async function addTask(title){
 const id=randomUUID();
 const result=cli('add',title,'--list-id','inbox','--request-id',id,'--wait','30');
 if(result)assert(['saved','received'].includes(result.status));
 const state=await until(()=>{const x=readDb(),row=receipt(id);return row?.status==='saved'&&row.task_count===1&&x.body.tasks.some(t=>t.id===id+':1'&&t.title===title)?x:null},30000);
 assert.equal(state.body.tasks.filter(t=>t.id===id+':1').length,1);
 return {state,task:state.body.tasks.find(t=>t.id===id+':1'),id};
}
async function stop(){
 assert(activePid);
 // No CDP or security-policy changes. Force-stop only our installed process
 // AFTER the independent durable transaction check, to exercise restart safety.
 const list=processes();assert(list.length===1&&list[0].Id===activePid);
 ps("$p=Get-Process -Id ([int]$env:TODO_QA_PID) -ErrorAction Stop; if($p.Path -ne $env:TODO_QA_EXE){throw 'Wrong process'}; Stop-Process -Id $p.Id -Force",{TODO_QA_PID:String(activePid)});
 await until(()=>processes().length===0,20000);
 activePid=null;
}
const title='QA signed upgrade retained 1845048',second='QA post-upgrade write 1845048';
const find=(state,t)=>state.body.tasks.find(x=>x.title===t);
const preserveBackups=(before,after)=>{assert(before.backups.length>0,'Expected real application-generated backup');for(const b of before.backups)assert(after.backups.some(x=>x.saved_at===b.saved_at&&JSON.stringify(x.body)===JSON.stringify(b.body)),'Existing backup lost or changed')};
try{
 report.phase='old-install';save();const oldInfo=installPackage(packages[0]);await start(versions[0],oldInfo);
 const binding=cli('bind','--scope','guest');if(binding)assert.equal(binding.bound,true);
 const old=await addTask(title),task=old.task;
 assert(task.id);assert(old.state.backups.length>0);
 pass('old installed app consumes supported CLI queue and commits task, receipt and backup',{id:task.id,backupCount:old.state.backups.length});
 inspectUI(title,'old task');await stop();
 const before=readDb();assert.deepEqual(find(before,title),task);preserveBackups(old.state,before);
 report.phase='overlay';save();const newInfo=installPackage(packages[1]);
 assert.notEqual(newInfo.hash,oldInfo.hash,'Installer did not replace old binary');
 assert(existsSync(db),'Installer removed existing database');
 const preserved=readDb();assert.deepEqual(find(preserved,title),task);preserveBackups(before,preserved);
 pass('actual NSIS overlay replaces binary and preserves original SQLite task and backups');
 await start(versions[1],newInfo);
 const after=readDb();assert.deepEqual(find(after,title),task);assert.equal(after.body.tasks.filter(t=>t.id===task.id).length,1);
 assert.equal(receipt(old.id)?.status,'saved');preserveBackups(before,after);
 inspectUI(title,'retained old task after upgrade');
 const added=await addTask(second);assert.deepEqual(find(added.state,title),task);preserveBackups(before,added.state);
 inspectUI(second,'new task after upgrade');await stop();
 const final=readDb();assert.deepEqual(find(final,title),task);assert.deepEqual(find(final,second),added.task);preserveBackups(before,final);
 pass('new installed app consumes CLI queue; both durable tasks and old receipts/backups survive process stop');
 report.phase='passed';save();
}catch(e){
 report.phase='failed';report.error=String(e);
 try{report.processes=processes()}catch{};report.sqliteExists=existsSync(db);report.installedExeExists=existsSync(executable);save();
 throw e;
}finally{
 if(activePid)try{const list=processes();if(list.length===1&&list[0].Id===activePid)await stop()}catch(e){console.error('Isolated cleanup:',e.message)}
 if(child&&child.exitCode===null)child.kill();
}
