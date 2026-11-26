import {test,expect} from '@playwright/test';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY,dayKey} from '../src/domain.js';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
test.skip(process.env.TODO_IDB_PILOT!=='1','isolated synthetic pilot only');
test.use({serviceWorkers:'block'});
const path='/src/services/web-workspace-shards.js',fixture=n=>({...initialState(),tasks:Array.from({length:n},(_,i)=>newTask('完整任务 '+i,'inbox',dayKey(),'shard-'+i))});
async function probe(page){await page.route('**/shard-probe',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Shard test</title>'}));await page.goto('/shard-probe')}
test('万级分片单任务修改、删除重排、作用域隔离和旧版本竞争',async({page,browserName})=>{
 test.setTimeout(90000);await probe(page);const raw=JSON.stringify(fixture(10000)),legacy=JSON.stringify(fixture(4));
 const result=await page.evaluate(async({path,raw,legacy,key,bkey})=>{
  const m=await import(path),db=await m.openShardDatabase();localStorage.setItem(key,legacy);
  const shadow=new Map(),other={getItem:k=>shadow.get(k)??null};shadow.set(key,JSON.stringify({...JSON.parse(legacy),theme:'dark'}));
  const start=performance.now();let base=await m.migrateShardWorkspace(db,'guest',localStorage,await m.sourceDigest({[key]:legacy}));
  const account=await m.migrateShardWorkspace(db,'account:synthetic-a',other,await m.sourceDigest({[key]:shadow.get(key)}));
  base=await m.commitShardWorkspace(db,base,{[key]:raw,[bkey]:raw},localStorage);
  const initialMs=performance.now()-start,state=JSON.parse(raw);state.tasks[5432].title+=' changed';const next={...base.values,[key]:JSON.stringify(state)};
  const begin=performance.now(),one=await m.commitShardWorkspace(db,base,next,localStorage),editMs=performance.now()-begin;
  let conflict=false;try{await m.commitShardWorkspace(db,base,next,localStorage)}catch{conflict=true}
  state.tasks.reverse();state.tasks.pop();const two=await m.commitShardWorkspace(db,one,{...one.values,[key]:JSON.stringify(state)},localStorage);
  const read=await m.readShardWorkspace(db,'guest'),a=await m.readShardWorkspace(db,'account:synthetic-a');
  localStorage.setItem(key,JSON.stringify({...JSON.parse(legacy),theme:'dark'}));let oldClient=false;try{await m.commitShardWorkspace(db,two,two.values,localStorage)}catch{oldClient=true}localStorage.setItem(key,legacy);
  db.close();return {initialMs,editMs,metrics:one.metrics,fullBytes:new TextEncoder().encode(raw).length,count:JSON.parse(read.values[key]).tasks.length,first:JSON.parse(read.values[key]).tasks[0].id,changed:JSON.parse(read.values[key]).tasks.find(x=>x.id==='shard-5432').title,backup:read.values[bkey]===raw,account:JSON.parse(a.values[key]).tasks.length===4&&a.revision===account.revision,conflict,oldClient,legacy:localStorage.getItem(key)===legacy};
 },{path,raw,legacy,key:STORAGE_KEY,bkey:BACKUP_KEY});
 expect(result.count).toBe(9999);expect(result.first).toBe('shard-9999');expect(result.changed).toContain('changed');expect(result.metrics.puts).toBe(2);expect(result.metrics.bytes+result.metrics.headerBytes).toBeLessThan(result.fullBytes/10);expect(result.backup&&result.account&&result.conflict&&result.oldClient&&result.legacy).toBe(true);
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/shard-metrics-'+browserName+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
});
test('显式迁移、摘要备份、恢复前归档、无损回退及旧数据保护 UI',async({page})=>{
 const d=fixture(3),raw=JSON.stringify(d);
 await page.addInitScript(({raw,key})=>{if(!sessionStorage.getItem('shard-test-initialized')){sessionStorage.setItem('shard-test-initialized','1');sessionStorage.setItem('todo-idb-pilot','synthetic-v2')}if(!localStorage.getItem(key))localStorage.setItem(key,raw)},{raw,key:STORAGE_KEY});
 await page.goto('/');const confirm=page.getByRole('button',{name:'确认迁移',exact:true});await expect(confirm).toBeDisabled();await page.getByRole('checkbox',{name:'确认仅复制隔离工作空间'}).check();await confirm.click();
 await expect(page.getByText('已提交工作空间 · 有效')).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出验证备份'}).click();const backupPath=await(await download).path(),backup=JSON.parse(readFileSync(backupPath,'utf8'));expect(backup.count).toBe(3);
 // Restore different verified data, retaining the pre-restore version atomically.
 const changed=await page.evaluate(async({path,backup,key})=>{const m=await import(path),d=JSON.parse(backup.values[key]);d.tasks[0].title='已恢复任务';return m.makeRecovery('guest',{...backup.values,[key]:JSON.stringify(d)})},{path,backup,key:STORAGE_KEY});
 const input=page.getByLabel('导入验证备份');await input.setInputFiles({name:'tampered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...changed,sha256:'0'.repeat(64)}))});await expect(page.getByRole('alert')).toContainText('摘要');
 await input.setInputFiles({name:'verified.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(changed))});await expect(page.getByText('已验证 3 项任务',{exact:false})).toBeVisible();await page.getByRole('button',{name:'确认恢复'}).click();await expect(page.getByText('版本 2 · 3 项任务')).toBeVisible();
 await page.getByRole('button',{name:'检查并无损回退'}).click();await expect(page.getByRole('alert')).toContainText('不能无损回退');
 await page.getByLabel('恢复前版本号').fill('1');const oldDownload=page.waitForEvent('download');await page.getByRole('button',{name:'导出恢复前版本'}).click();const old=JSON.parse(readFileSync(await(await oldDownload).path(),'utf8'));expect(old.sha256).toBe(backup.sha256);
 await page.getByRole('button',{name:'打开试验工作空间'}).click();await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible();await page.getByRole('button',{name:'全局搜索',exact:true}).click();await page.getByRole('combobox',{name:'搜索命令与任务'}).fill('已恢复任务');await expect(page.getByRole('option').filter({hasText:'已恢复任务'})).toBeVisible();await page.getByRole('combobox',{name:'搜索命令与任务'}).press('Escape');
 await page.getByRole('button',{name:'试验存储管理'}).click();await expect(page.getByText('已提交工作空间 · 有效')).toBeVisible();
 await page.getByLabel('导入验证备份').setInputFiles({name:'original.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await page.getByRole('button',{name:'确认恢复'}).click();await expect(page.getByText(backup.sha256,{exact:false})).toBeVisible();await page.getByRole('button',{name:'检查并无损回退'}).click();await expect(page.getByText('已提交工作空间 · 已回退')).toBeVisible();await expect(page.getByRole('button',{name:'打开试验工作空间'})).toBeDisabled();expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(raw);
 await page.evaluate(()=>sessionStorage.removeItem('todo-idb-pilot'));await page.reload();await expect(page.getByText('已提交工作空间 · 已回退')).toBeVisible();
});
test('确认后的原始数据变化及事务中止不会覆盖已提交数据',async({page})=>{
 await probe(page);const raw=JSON.stringify(fixture(3));
 const result=await page.evaluate(async({path,raw,key})=>{
  const m=await import(path),db=await m.openShardDatabase();localStorage.setItem(key,raw);const digest=await m.sourceDigest({[key]:raw});localStorage.setItem(key,JSON.stringify({...JSON.parse(raw),theme:'dark'}));
  let stale=false;try{await m.migrateShardWorkspace(db,'guest',localStorage,digest)}catch{stale=true}const absent=await m.readShardWorkspace(db,'guest')===null;
  localStorage.setItem(key,raw);const base=await m.migrateShardWorkspace(db,'guest',localStorage,digest),old=IDBObjectStore.prototype.put;let inject=true;
  IDBObjectStore.prototype.put=function(...args){const req=old.apply(this,args);if(inject&&args[0].kind==='header')req.addEventListener('success',()=>this.transaction.abort(),{once:true});return req};
  const state=JSON.parse(raw);state.tasks[0].title='aborted edit';const values={...base.values,[key]:JSON.stringify(state)},storage=m.createShardStore(db,base,localStorage);
  storage.setItem(key,values[key]);const failed=await storage.flush(),after=await m.readShardWorkspace(db,'guest');inject=false;const retry=await storage.flush(),saved=await m.readShardWorkspace(db,'guest');IDBObjectStore.prototype.put=old;db.close();return {stale,absent,failed,old:after.revision===1&&JSON.parse(after.values[key]).tasks[0].title===JSON.parse(raw).tasks[0].title,retry,saved:saved.revision===2&&JSON.parse(saved.values[key]).tasks[0].title==='aborted edit',legacy:localStorage.getItem(key)===raw};
 },{path,raw,key:STORAGE_KEY});
 expect(result).toEqual({stale:true,absent:true,failed:false,old:true,retry:true,saved:true,legacy:true});
});

test('分片摘要检测缺失备份及有效JSON的静默篡改',async({page})=>{
 await probe(page);const raw=JSON.stringify(fixture(3));
 const result=await page.evaluate(async({path,raw,key,bkey})=>{
  const m=await import(path),db=await m.openShardDatabase();localStorage.setItem(key,raw);localStorage.setItem(bkey,raw);
  const row=await m.migrateShardWorkspace(db,'guest',localStorage,await m.sourceDigest({[key]:raw,[bkey]:raw}));
  const change=async(fn)=>new Promise((resolve,reject)=>{const t=db.transaction('records','readwrite');t.oncomplete=resolve;t.onabort=()=>reject(t.error);fn(t.objectStore('records'))});
  await change(store=>store.delete(['guest','part','kv:'+bkey]));let missing=false;try{await m.readShardWorkspace(db,'guest')}catch(e){missing=e.message.includes('摘要')}
  await change(store=>{store.put({scope:'guest',kind:'part',key:'kv:'+bkey,value:raw});store.put({scope:'guest',kind:'part',key:'meta',value:JSON.stringify({...JSON.parse(row.parts.get('meta')),theme:'dark'})})});
  let tamper=false;try{await m.readShardWorkspace(db,'guest')}catch(e){tamper=e.message.includes('摘要')}db.close();return {missing,tamper};
 },{path,raw,key:STORAGE_KEY,bkey:BACKUP_KEY});
 expect(result).toEqual({missing:true,tamper:true});
});
test('同一浏览器多标签页独占及损坏数据原始导出',async({page,context})=>{
 const raw=JSON.stringify(fixture(3));
 await page.addInitScript(({raw,key})=>{sessionStorage.setItem('todo-idb-pilot','synthetic-v2');if(!localStorage.getItem(key))localStorage.setItem(key,raw)},{raw,key:STORAGE_KEY});
 await page.goto('/');await page.getByRole('checkbox',{name:'确认仅复制隔离工作空间'}).check();await page.getByRole('button',{name:'确认迁移'}).click();await expect(page.getByText('已提交工作空间 · 有效')).toBeVisible();
 const second=await context.newPage();await second.goto('/');await expect(second.getByText('隔离工作空间无法取得独占锁')).toBeVisible();
 await page.evaluate(async({path})=>{const m=await import(path),db=await m.openShardDatabase();await new Promise((resolve,reject)=>{const t=db.transaction('records','readwrite');t.oncomplete=resolve;t.onabort=()=>reject(t.error);t.objectStore('records').delete(['guest','part','order'])});db.close()},{path});
 await page.close();await second.reload();await expect(second.getByRole('alert')).toContainText('摘要');await expect(second.getByRole('button',{name:'确认迁移'})).toHaveCount(0);
 const dl=second.waitForEvent('download');await second.getByRole('button',{name:'导出未校验原始分片'}).click();const recovered=JSON.parse(readFileSync(await(await dl).path(),'utf8'));expect(recovered.source[STORAGE_KEY]).toBe(raw);expect(recovered.records.length).toBeGreaterThan(2);await second.close();
});
