import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,STORAGE_KEY,BACKUP_KEY} from '../src/domain.js';
import {mkdirSync,writeFileSync} from 'node:fs';

test.skip(process.env.TODO_IDB_PILOT!=='1','Requires isolated pilot dev server; never runs against ordinary production build');
test.use({serviceWorkers:'block'});
const modulePath='/src/services/web-workspace-store.js';
const fixture=count=>({...initialState(),tasks:Array.from({length:count},(_,i)=>newTask('完整任务 '+i,'inbox',dayKey(),'pilot-'+i))});
async function probe(page){
 await page.route('**/pilot-probe',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic IndexedDB probe</title>'}));
 await page.goto('/pilot-probe');
}
test('事务迁移、版本竞争、原始数据不变、无损回滚及拒绝有损回滚',async({page})=>{
 await probe(page);
 const raw=JSON.stringify(fixture(12)),backup=JSON.stringify(fixture(5));
 const result=await page.evaluate(async({raw,backup,key,bkey,modulePath})=>{
  const m=await import(modulePath),db=await m.openPilotDatabase();
  try{
   localStorage.setItem(key,raw);localStorage.setItem(bkey,backup);
   const one=await m.loadOrMigrate(db,localStorage),again=await m.loadOrMigrate(db,localStorage);
   const changed={...one.values,[key]:JSON.stringify({...JSON.parse(raw),theme:'dark'})};
   const race=await Promise.allSettled([m.commitPilotSnapshot(db,one.revision,changed),m.commitPilotSnapshot(db,one.revision,changed)]);
   const saved=await m.readPilotRecord(db);
   let rejected=false;try{await m.rollbackPilot(db,localStorage,saved.revision)}catch{rejected=true}
   let invalid=false;try{await m.commitPilotSnapshot(db,saved.revision,{...saved.values,[key]:'bad'})}catch{invalid=true}
   const preserved=await m.readPilotRecord(db);
   localStorage.setItem(key,backup);let diverged=false;try{await m.loadOrMigrate(db,localStorage)}catch{diverged=true}localStorage.setItem(key,raw);
   const returned=await m.commitPilotSnapshot(db,saved.revision,one.values),retired=await m.rollbackPilot(db,localStorage,returned.revision);
   let noReopen=false;try{await m.loadOrMigrate(db,localStorage)}catch{noReopen=true}
   return {initial:one.revision,reopen:again.revision,race:race.map(x=>x.status),saved:saved.revision,rejected,invalid,unchanged:preserved.revision===saved.revision,diverged,retired:retired.mode,noReopen,legacy:localStorage.getItem(key)===raw&&localStorage.getItem(bkey)===backup};
  }finally{db.close()}
 },{raw,backup,key:STORAGE_KEY,bkey:BACKUP_KEY,modulePath});
 expect(result).toEqual({initial:1,reopen:1,race:['fulfilled','rejected'],saved:2,rejected:true,invalid:true,unchanged:true,diverged:true,retired:'retired',noReopen:true,legacy:true});
});
test('真实 IndexedDB 万级完整字段与备份、实际 UI 修改和重载',async({page,browserName})=>{
 test.setTimeout(90000);
 await probe(page);const data=fixture(10000),raw=JSON.stringify(data),legacy=JSON.stringify(fixture(3));
 const metrics=await page.evaluate(async({raw,legacy,key,bkey,modulePath})=>{
  const m=await import(modulePath);localStorage.setItem(key,legacy);const db=await m.openPilotDatabase();
  try{const start=performance.now(),one=await m.loadOrMigrate(db,localStorage),migrateMs=performance.now()-start;
   const begin=performance.now(),two=await m.commitPilotSnapshot(db,one.revision,{...one.values,[key]:raw,[bkey]:raw}),writeMs=performance.now()-begin;
   const readStart=performance.now(),saved=await m.readPilotRecord(db),readMs=performance.now()-readStart;
   sessionStorage.setItem('todo-idb-pilot','synthetic-only');
   return {migrateMs,writeMs,readMs,revision:two.revision,tasks:JSON.parse(saved.values[key]).tasks.length,backup:JSON.parse(saved.values[bkey]).tasks.length,source:localStorage.getItem(key)===legacy};
  }finally{db.close()}
 },{raw,legacy,key:STORAGE_KEY,bkey:BACKUP_KEY,modulePath});
 expect(metrics.tasks).toBe(10000);expect(metrics.backup).toBe(10000);expect(metrics.source).toBe(true);
 await page.goto('/');await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible({timeout:20000});
 const input=page.getByRole('textbox',{name:'新任务名称'});await input.fill('IndexedDB 实际新增');await input.press('Enter');await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible({timeout:20000});
 const saved=await page.evaluate(async({modulePath,key})=>{const m=await import(modulePath),db=await m.openPilotDatabase();try{return JSON.parse((await m.readPilotRecord(db)).values[key]).tasks.map(t=>t.title)}finally{db.close()}},{modulePath,key:STORAGE_KEY});
 expect(saved.length).toBe(10001);expect(saved).toContain('IndexedDB 实际新增');
 await page.reload();await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible({timeout:20000});await page.getByRole('button',{name:'全局搜索',exact:true}).click();await page.getByRole('combobox',{name:'搜索命令与任务'}).fill('IndexedDB 实际新增');await expect(page.getByRole('option').filter({hasText:'IndexedDB 实际新增'})).toBeVisible();await page.getByRole('combobox',{name:'搜索命令与任务'}).press('Escape');
 expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(legacy);
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/idb-pilot-'+browserName+'.json',JSON.stringify({...metrics,bytes:Buffer.byteLength(raw),afterEdit:saved.length},null,2));console.log(JSON.stringify(metrics));
});
test('真实事务写入失败：镜像草稿、旧提交和重试',async({page})=>{
 await probe(page);const raw=JSON.stringify(fixture(3));
 const result=await page.evaluate(async({raw,key,modulePath})=>{
  const m=await import(modulePath);localStorage.setItem(key,raw);const db=await m.openPilotDatabase(),status=[];
  try{const s=await m.createWebPilotStore(db,localStorage,x=>status.push(x));const old=await s.readCommitted();
   // Inject a transaction abort after the actual put. The previous committed record must survive.
   const transaction=db.transaction.bind(db);let inject='abort';
   db.transaction=(...args)=>{const tx=transaction(...args);if(inject&&args[1]==='readwrite'){const original=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=original(name),put=store.put.bind(store);store.put=value=>{if(inject==='quota')throw new DOMException('synthetic quota','QuotaExceededError');const request=put(value);request.onsuccess=()=>tx.abort();return request};return store}}return tx};
   const next=JSON.stringify({...JSON.parse(raw),theme:'dark'});s.setItem(key,next);const failed=await s.flush(),after=await s.readCommitted(),draft=s.getItem(key),error=s.getStatus().error;
   inject='quota';const quotaFailed=await s.flush(),quotaState=await s.readCommitted(),quotaError=s.getStatus().error;inject=false;const retried=await s.flush(),saved=await s.readCommitted();
   return {failed,revision:after.revision,old:after.values[key]===old.values[key],draft:draft===next,error:!!error,quotaFailed,quotaPreserved:quotaState.revision===old.revision,quotaError:quotaError.includes('QuotaExceededError'),retried,saved:saved.values[key]===next,legacy:localStorage.getItem(key)===raw,pending:s.getStatus().pending};
  }finally{db.close()}
 },{raw,key:STORAGE_KEY,modulePath});
 expect(result).toEqual({failed:false,revision:1,old:true,draft:true,error:true,quotaFailed:false,quotaPreserved:true,quotaError:true,retried:true,saved:true,legacy:true,pending:false});
});

test('原始主数据损坏或缺失时不得创建空数据库记录',async({page})=>{
 await probe(page);const raw=JSON.stringify(fixture(3));
 const result=await page.evaluate(async({raw,key,bkey,modulePath})=>{
  const m=await import(modulePath),db=await m.openPilotDatabase();
  try{
   localStorage.setItem(bkey,raw);let missing=false,corrupt=false;
   try{await m.loadOrMigrate(db,localStorage)}catch{missing=true}
   localStorage.setItem(key,'broken-json');try{await m.loadOrMigrate(db,localStorage)}catch{corrupt=true}
   const empty=await m.readRawPilotRecord(db);return {missing,corrupt,empty,backup:localStorage.getItem(bkey)===raw,source:localStorage.getItem(key)==='broken-json'};
  }finally{db.close()}
 },{raw,key:STORAGE_KEY,bkey:BACKUP_KEY,modulePath});
 expect(result).toEqual({missing:true,corrupt:true,empty:null,backup:true,source:true});
});
test('试验 UI 异步写入中止时保留草稿并可恢复',async({page})=>{
 const d=fixture(3),legacy=JSON.stringify(d);
 await page.addInitScript(({legacy,key})=>{sessionStorage.setItem('todo-idb-pilot','synthetic-only');if(!localStorage.getItem(key))localStorage.setItem(key,legacy);window.__pilotAbort=false;const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(window.__pilotAbort&&this.name==='workspaces')request.addEventListener('success',()=>this.transaction.abort(),{once:true});return request}},{legacy,key:STORAGE_KEY});
 await page.goto('/');await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible();
 await page.evaluate(()=>window.__pilotAbort=true);
 const input=page.getByRole('textbox',{name:'新任务名称'});await input.fill('异步保存失败的草稿');await input.press('Enter');
 const alert=page.getByRole('alert').filter({hasText:'IndexedDB 保存失败'});await expect(alert).toBeVisible();
 const read=()=>page.evaluate(async({modulePath,key})=>{const m=await import(modulePath),db=await m.openPilotDatabase();try{return JSON.parse((await m.readPilotRecord(db)).values[key]).tasks.length}finally{db.close()}},{modulePath,key:STORAGE_KEY});
 expect(await read()).toBe(3);expect(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})).toBe(true);
 await expect(alert.getByRole('button',{name:'导出当前数据'})).toBeVisible();
 await page.evaluate(()=>window.__pilotAbort=false);await alert.getByRole('button',{name:'重试保存'}).click();await expect(alert).toHaveCount(0);await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible();expect(await read()).toBe(4);expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(legacy);
 expect(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})).toBe(false);
});
