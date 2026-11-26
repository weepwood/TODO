import {test,expect} from '@playwright/test';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY,dayKey} from '../src/domain.js';
import {mkdirSync,writeFileSync} from 'node:fs';
test.skip(process.env.TODO_IDB_PILOT!=='1','isolated synthetic pilot only');
test.use({serviceWorkers:'block'});
const path='/src/services/web-workspace-shards.js',protocol='/src/services/storage-switch-protocol.js';
const fixture=n=>({...initialState(),tasks:Array.from({length:n},(_,i)=>newTask('增量任务 '+i,'inbox',dayKey(),'inc-'+i))});
async function probe(page){await page.route('**/incremental-probe',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Incremental test</title>'}));await page.goto('/incremental-probe')}
test('万级增量计算、连续编辑与事务重试保持完整数据',async({page,browserName})=>{
 await probe(page);const raw=JSON.stringify(fixture(10000)),legacy=JSON.stringify(fixture(3));
 const result=await page.evaluate(async({path,raw,legacy,key,bkey})=>{
  const m=await import(path),db=await m.openShardDatabase();localStorage.setItem(key,legacy);let base=await m.migrateShardWorkspace(db,'guest',localStorage,await m.sourceDigest({[key]:legacy}));base=await m.commitShardWorkspace(db,base,{[key]:raw,[bkey]:raw,[bkey+'-at']:String(Date.now())},localStorage);
  const store=m.createShardStore(db,base,localStorage),state=JSON.parse(raw);
  store.stageWorkspace(state);await store.flush();const warmed=store.metrics(),start=performance.now();
  const next={...state,tasks:state.tasks.map((t,i)=>i===5000?{...t,title:'实际修改'}:t)};
  store.stageWorkspace(next);const saved=await store.flush(),editMs=performance.now()-start,metrics=store.metrics();
  const old=IDBObjectStore.prototype.put;let abort=true;IDBObjectStore.prototype.put=function(...args){const req=old.apply(this,args);if(abort&&args[0].kind==='header')req.addEventListener('success',()=>this.transaction.abort(),{once:true});return req};
  const third={...next,tasks:[...next.tasks.slice(1).reverse(),{...next.tasks[0],id:'new-id'}]};store.stageWorkspace(third);
  const failed=await store.flush(),preserved=await store.readCommitted();abort=false;const retry=await store.flush(),read=await store.readCommitted();IDBObjectStore.prototype.put=old;
  const oracle=m.splitSnapshot({[key]:JSON.stringify(third),[bkey]:raw,[bkey+'-at']:base.values[bkey+'-at']});const diff=m.diffParts(read.parts,oracle);
  db.close();return {saved,editMs,warmed,metrics,failed,preserved:JSON.parse(preserved.values[key]).tasks[5000].title==='实际修改',retry,match:!diff.put.length&&!diff.remove.length,legacy:localStorage.getItem(key)===legacy,fullBytes:new TextEncoder().encode(raw).length};
 },{path,raw,legacy,key:STORAGE_KEY,bkey:BACKUP_KEY});
 expect(result.saved&&result.preserved&&result.retry&&result.match&&result.legacy).toBe(true);expect(result.failed).toBe(false);expect(result.metrics.serializedBuckets).toBe(1);expect(result.metrics.reusedBuckets).toBe(127);expect(result.metrics.fullSerializations).toBe(0);
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/incremental-'+browserName+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
});
test('归档容量拒绝、外部副本核对与明确清理',async({page})=>{
 await probe(page);const raw=JSON.stringify(fixture(3));
 const result=await page.evaluate(async({path,raw,key})=>{
  const m=await import(path),db=await m.openShardDatabase();localStorage.setItem(key,raw);let base=await m.migrateShardWorkspace(db,'guest',localStorage,await m.sourceDigest({[key]:raw}));
  const initial=await m.makeRecovery('guest',base.values);
  for(let i=0;i<5;i++){const d=JSON.parse(base.values[key]);d.tasks[0].title='restore '+i;const f=await m.makeRecovery('guest',{...base.values,[key]:JSON.stringify(d)});base=await m.restoreShardRecovery(db,base,JSON.stringify(f),localStorage)}
  const count=(await m.listRecoveryArchives(db,'guest')).length;
  let refused=false,mismatch=false;try{await m.restoreShardRecovery(db,base,JSON.stringify(initial),localStorage)}catch(e){refused=e.message.includes('容量上限')}
  const unchanged=(await m.readShardWorkspace(db,'guest')).revision===base.revision;
  const wrong=await m.makeRecovery('guest',base.values);try{await m.removeVerifiedArchive(db,'guest',1,JSON.stringify(wrong))}catch{mismatch=true}
  await m.removeVerifiedArchive(db,'guest',1,JSON.stringify(initial));const remaining=(await m.listRecoveryArchives(db,'guest')).length;
  const restored=await m.restoreShardRecovery(db,base,JSON.stringify(initial),localStorage);db.close();
  return {count,refused,unchanged,mismatch,remaining,restored:await m.semanticDigest(restored.values)===initial.sha256,legacy:localStorage.getItem(key)===raw};
 },{path,raw,key:STORAGE_KEY});
 expect(result).toEqual({count:5,refused:true,unchanged:true,mismatch:true,remaining:4,restored:true,legacy:true});
});
test('切换协议故障恢复、合作旧写入器拒绝、过期试验写入保留草稿',async({page})=>{
 await probe(page);const raw=JSON.stringify(fixture(3));
 const result=await page.evaluate(async({path,protocol,raw,key})=>{
  const m=await import(path),p=await import(protocol),db=await m.openShardDatabase();localStorage.setItem(key,raw);
  const hash=await m.sourceDigest({[key]:raw});p.setSwitch(localStorage,'preparing',hash);
  let legacyBlocked=false;try{p.assertLegacyWriter(localStorage)}catch{legacyBlocked=true}
  const base=await m.migrateShardWorkspace(db,'guest',localStorage,hash);p.setSwitch(localStorage,'active',hash);
  let runtime=true;const store=m.createShardStore(db,base,localStorage,undefined,{guard:true,checkRuntime:()=>{if(!runtime)throw Error('worker changed')}});const next={...JSON.parse(raw),theme:'dark'};
  localStorage.removeItem(p.SWITCH_KEY);store.stageWorkspace(next);const failed=await store.flush(),old=(await store.readCommitted()).revision===base.revision,draft=JSON.parse(store.getItem(key)).theme==='dark';
  p.setSwitch(localStorage,'active',hash);runtime=false;const runtimeFailed=await store.flush(),runtimePreserved=(await store.readCommitted()).revision===base.revision;runtime=true;const retried=await store.flush(),saved=await store.readCommitted();db.close();
  return {legacyBlocked,failed,old,draft,runtimeFailed,runtimePreserved,retried,saved:JSON.parse(saved.values[key]).theme==='dark',legacy:localStorage.getItem(key)===raw};
 },{path,protocol,raw,key:STORAGE_KEY});
 expect(result).toEqual({legacyBlocked:true,failed:false,old:true,draft:true,runtimeFailed:false,runtimePreserved:true,retried:true,saved:true,legacy:true});
});
test('恢复管理独立320px双主题及归档明确清理操作',async({page,browserName})=>{
 await page.setViewportSize({width:320,height:844});
 const raw=JSON.stringify({...fixture(3),theme:'dark'});
 await page.addInitScript(({raw,key})=>{sessionStorage.setItem('todo-idb-pilot','synthetic-v2');if(!localStorage.getItem(key))localStorage.setItem(key,raw)},{raw,key:STORAGE_KEY});
 await page.goto('/');await page.getByRole('checkbox',{name:'确认仅复制隔离工作空间'}).check();await page.getByRole('button',{name:'确认迁移'}).click();
 await expect(page.getByRole('heading',{name:'Web 存储迁移与恢复试验'})).toHaveCount(1);await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.getByText('已提交工作空间 · 有效')).toBeVisible();
 expect(await page.locator('.shard-pilot-gate').evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
 const output='test-results/recovery-final-'+browserName;mkdirSync('test-results',{recursive:true});await page.screenshot({path:output+'-dark.png',animations:'disabled'});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出验证备份'}).click();const backup=await(await download).path();
 await page.getByLabel('导入验证备份').setInputFiles(backup);await expect(page.getByRole('button',{name:'仅导出，不替换'})).toBeVisible();const portable=page.waitForEvent('download');await page.getByRole('button',{name:'仅导出，不替换'}).click();await portable;await expect(page.getByText('版本 1 · 3 项任务')).toBeVisible();
 await page.getByRole('button',{name:'取消',exact:true}).click();const updated=await page.evaluate(async({path,key})=>{const m=await import(path),db=await m.openShardDatabase();try{const row=await m.readShardWorkspace(db,'guest'),state=JSON.parse(row.values[key]);state.theme='light';return m.makeRecovery('guest',{...row.values,[key]:JSON.stringify(state)})}finally{db.close()}},{path,key:STORAGE_KEY});
 await page.getByLabel('导入验证备份').setInputFiles({name:'light.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(updated))});await page.getByRole('button',{name:'确认恢复'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.getByText(/恢复归档：1 \/ 5/)).toBeVisible();await page.screenshot({path:output+'-light.png',animations:'disabled'});
 await page.getByLabel('恢复前版本号').fill('1');await page.getByLabel('重新导入已验证外部归档').setInputFiles(backup);await page.getByRole('button',{name:'确认清理已验证归档'}).click();await expect(page.getByText(/恢复归档：0 \/ 5/)).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(raw);
});
