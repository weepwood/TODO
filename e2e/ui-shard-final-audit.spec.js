import {test,expect} from '@playwright/test';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY,dayKey} from '../src/domain.js';
test.skip(process.env.TODO_IDB_PILOT!=='1','isolated synthetic pilot only');
const path='/src/services/web-workspace-shards.js',protocol='/src/services/storage-switch-protocol.js';
const fixture=n=>({...initialState(),tasks:Array.from({length:n},(_,i)=>newTask('最终审计任务 '+i,'inbox',dayKey(),'audit-'+i))});
test('真实事务随机差分及两个连接并发恢复围栏',async({page})=>{
 await page.route('**/final-audit-probe',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Audit</title>'}));await page.goto('/final-audit-probe');
 const raw=JSON.stringify(fixture(32));
 const result=await page.evaluate(async({path,protocol,raw,key,bkey})=>{
  const m=await import(path),p=await import(protocol),db=await m.openShardDatabase(),other=await m.openShardDatabase();localStorage.setItem(key,raw);
  const hash=await m.sourceDigest({[key]:raw});p.setSwitch(localStorage,'preparing',hash);let row=await m.migrateShardWorkspace(db,'guest',localStorage,hash);p.setSwitch(localStorage,'active',hash);
  let state=JSON.parse(raw),seed=0x1234abcd;const rand=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n};
  const store=m.createShardStore(db,row,localStorage,undefined,{guard:true});
  for(let i=0;i<36;i++){
   const j=rand(state.tasks.length);let tasks=state.tasks;
   if(i%4===0)tasks=tasks.map((t,k)=>k===j?{...t,title:'随机 '+i,checklist:[{id:'c'+i,text:'检查',done:true}]}:t);
   if(i%4===1)tasks=[...tasks].reverse();
   if(i%4===2)tasks=[...tasks,{...tasks[j],id:'added-'+i}];
   if(i%4===3)tasks=tasks.filter((_,k)=>k!==j);
   state={...state,tasks,theme:i%2?'dark':'light'};store.stageWorkspace(state);if(!await store.flush())throw Error('commit failed');
   const actual=await m.readShardWorkspace(other,'guest'),expected=JSON.parse(store.getItem(key));
   if(JSON.stringify(JSON.parse(actual.values[key]))!==JSON.stringify({...Object.fromEntries(Object.entries(expected).filter(([k])=>k!=='tasks')),tasks:expected.tasks}))throw Error('oracle mismatch '+i);
  }
  row=await m.readShardWorkspace(db,'guest');
  const original=await m.makeRecovery('guest',{[key]:raw});
  localStorage.removeItem(p.SWITCH_KEY);
  let refused=false;try{await m.restoreShardRecovery(db,row,JSON.stringify(original),localStorage,{guard:true})}catch{refused=true}
  const untouched=(await m.readShardWorkspace(other,'guest')).revision===row.revision&&(await m.listRecoveryArchives(other,'guest')).length===0;
  p.setSwitch(localStorage,'active',hash);
  const edited={...row.values,[key]:JSON.stringify({...state,theme:'system'})};
  const [a,b]=await Promise.allSettled([m.restoreShardRecovery(db,row,JSON.stringify(original),localStorage,{guard:true}),m.commitShardWorkspace(other,row,edited,localStorage,{guard:true})]);
  const final=await m.readShardWorkspace(other,'guest'),archives=await m.listRecoveryArchives(other,'guest');
  const winners=[a,b].filter(x=>x.status==='fulfilled').length;
  const actualHash=await m.semanticDigest(final.values),expectedHash=a.status==='fulfilled'?original.sha256:await m.semanticDigest(edited);
  db.close();other.close();
  return {steps:36,refused,untouched,winners,finalRevision:final.revision-row.revision,archiveCount:archives.length,expectedArchives:a.status==='fulfilled'?1:0,match:actualHash===expectedHash,legacy:localStorage.getItem(key)===raw};
 },{path,protocol,raw,key:STORAGE_KEY,bkey:BACKUP_KEY});
 expect(result).toMatchObject({steps:36,refused:true,untouched:true,winners:1,finalRevision:1,match:true,legacy:true});expect(result.archiveCount).toBe(result.expectedArchives);
});
test('真实旧PWA拦截及卸载后的隔离迁移恢复演练',async({page,context})=>{
 const raw=JSON.stringify(fixture(3));
 // Real test-only worker served by isolated Vite, never an installed user PWA.
 await page.goto('/final-audit-probe');
 await page.evaluate(async({raw,key})=>{localStorage.setItem(key,raw);sessionStorage.setItem('todo-idb-pilot','synthetic-v2');await navigator.serviceWorker.register('/audit-legacy-sw.js');await navigator.serviceWorker.ready},{raw,key:STORAGE_KEY});
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await page.goto('/');await expect(page.getByRole('alert')).toContainText('PWA 工作线程版本不兼容');await expect(page.getByRole('button',{name:'确认迁移'})).toHaveCount(0);
 expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(raw);
 expect(await page.evaluate(()=>localStorage.getItem('todo-shard-switch-protocol'))).toBeNull();
 await page.evaluate(async()=>{for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister()});
 // Controller persists until all old controlled clients close.
 await page.close();const clean=await context.newPage();await clean.addInitScript(()=>sessionStorage.setItem('todo-idb-pilot','synthetic-v2'));await clean.goto('/');
 await expect(clean.getByRole('checkbox',{name:'确认仅复制隔离工作空间'})).toBeVisible();
 await clean.getByRole('checkbox',{name:'确认仅复制隔离工作空间'}).check();await clean.getByRole('button',{name:'确认迁移'}).click();await expect(clean.getByText('已提交工作空间 · 有效')).toBeVisible();
 await clean.getByRole('button',{name:'检查并无损回退'}).click();await expect(clean.getByText('已提交工作空间 · 已回退')).toBeVisible();expect(await clean.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(raw);
});

test('真实Chromium IndexedDB队列对象保留路径',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','V8 CDP heap graph');
 test.setTimeout(60000);
 await page.goto('/final-audit-probe');const raw=JSON.stringify(fixture(100));
 await page.evaluate(async({path,raw,key,bkey})=>{
  const m=await import(path),db=await m.openShardDatabase();localStorage.setItem(key,raw);
  let base=await m.migrateShardWorkspace(db,'guest',localStorage,await m.sourceDigest({[key]:raw}));
  base=await m.commitShardWorkspace(db,base,{...base.values,[bkey]:raw,[bkey+'-at']:String(Date.now())},localStorage);
  const store=m.createShardStore(db,base,localStorage),initial=JSON.parse(raw);
  for(const label of ['retired-probe-marker','active-probe-marker']){
   const state={...initial,tasks:initial.tasks.map((t,i)=>i===0?{...t,probe:{label,syntheticRetainerProbe:true}}:t)};
   store.stageWorkspace(state);if(!await store.flush())throw Error('probe write failed');
  }
  globalThis.__todoShardRetainerProbe=store;
 },{path,raw,key:STORAGE_KEY,bkey:BACKUP_KEY});
 const cdp=await context.newCDPSession(page);
 for(let i=0;i<3;i++)await cdp.send('HeapProfiler.collectGarbage');
 const chunks=[];let bytes=0;const limit=32*1024*1024;
 cdp.on('HeapProfiler.addHeapSnapshotChunk',({chunk})=>{bytes+=Buffer.byteLength(chunk);if(bytes<=limit)chunks.push(chunk)});
 await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});
 expect(bytes).toBeLessThanOrEqual(limit);
 const {inspectShardHeap}=await import('../scripts/inspect-shard-heap.mjs');
 const result={fixtureTasks:100,...inspectShardHeap(JSON.parse(chunks.join(''))),snapshotBytes:bytes,method:'Real Chromium IndexedDB queue; synthetic page, strong paths after GC, not full React UI'};
 const {mkdirSync,writeFileSync}=await import('node:fs');mkdirSync('test-results',{recursive:true});writeFileSync('test-results/browser-retainer.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));expect(result.activeTags).toBe(1);expect(result.retiredTags).toBe(0);expect(result.strongPath.length).toBeGreaterThan(0);
 await cdp.detach();
});
