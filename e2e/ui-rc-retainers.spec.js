import {test,expect} from '@playwright/test';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY,dayKey} from '../src/domain.js';
import {mkdirSync,writeFileSync,openSync,writeSync,closeSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
test.skip(process.env.TODO_IDB_PILOT!=='1'||process.env.TODO_UI_RETAINER!=='1','Explicit isolated heap budget required');
test.use({serviceWorkers:'block',reducedMotion:'reduce'});
test('完整React页面的旧任务对象保留路径',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','V8 CDP graph');test.setTimeout(180000);
 const key=STORAGE_KEY,bkey=BACKUP_KEY,path='/src/services/web-workspace-shards.js';
 const id='ui-retainer-target',prefix='UI保留路径标记-',legacy=JSON.stringify(initialState());
 const raw=JSON.stringify({...initialState(),tasks:[{...newTask(prefix+'00','inbox',dayKey(),id),createdAt:new Date(Date.now()+60000).toISOString()},...Array.from({length:99},(_,i)=>newTask('合成任务 '+i,'inbox',dayKey(),'ui-retainer-'+i))]});
 await page.route('**/ui-retainer-probe',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>UI retainer</title>'}));await page.goto('/ui-retainer-probe');
 await page.evaluate(async({path,key,bkey,legacy,raw})=>{
  const m=await import(path),db=await m.openShardDatabase();localStorage.setItem(key,legacy);const first=await m.migrateShardWorkspace(db,'guest',localStorage,await m.sourceDigest({[key]:legacy}));
  await m.commitShardWorkspace(db,first,{[key]:raw,[bkey]:raw,[bkey+'-at']:String(Date.now())},localStorage);db.close();sessionStorage.setItem('todo-idb-pilot','synthetic-v2');
 },{path,key,bkey,legacy,raw});
 await page.goto('/');await page.getByRole('button',{name:'打开试验工作空间'}).click();await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible();
 const rail=page.locator('.rail');await page.locator('[data-view-key=inbox]').click();
 const search=page.locator('[data-row-id="'+id+'"]');
 await expect(search).toBeVisible();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(let i=1;i<=42;i++){
  const title=prefix+String(i).padStart(2,'0');
  await search.locator('.task-title-text').click();const input=page.getByRole('textbox',{name:'行内任务标题'});await input.fill(title);await input.press('Enter');
  await expect(search.locator('.task-title-text')).toHaveText(title);await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible();
 }
 // Reconcile actual persisted state before the snapshot, then release that read.
 const actual=await page.evaluate(async({path,key,id})=>{const m=await import(path),db=await m.openShardDatabase();try{const s=JSON.parse((await m.readShardWorkspace(db,'guest')).values[key]);return {count:s.tasks.length,title:s.tasks.find(t=>t.id===id).title}}finally{db.close()}},{path,key,id});
 expect(actual).toEqual({count:100,title:prefix+'42'});expect(errors).toEqual([]);
 const cdp=await context.newCDPSession(page);for(let i=0;i<3;i++)await cdp.send('HeapProfiler.collectGarbage');
 const limit=128*1024*1024;let bytes=0,graph;
 if(!process.env.TMPDIR)throw Error('explicit resource-gated external TMPDIR required');
 const file=join(process.env.TMPDIR,'todo-ui-synthetic.heapsnapshot'),fd=openSync(file,'wx');
 try{
  try{
   cdp.on('HeapProfiler.addHeapSnapshotChunk',({chunk})=>{bytes+=Buffer.byteLength(chunk);if(bytes<=limit)writeSync(fd,chunk)});
   await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});
  }finally{closeSync(fd)}
  expect(bytes).toBeLessThanOrEqual(limit);
  graph=JSON.parse(execFileSync('python3',['scripts/inspect-ui-task-heap.py',file,id,prefix],{encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024}));
 }finally{unlinkSync(file)}
 const counts={};for(const obj of graph.taskObjects)counts[obj.title]=(counts[obj.title]||0)+1;
 expect(counts[prefix+'42']).toBeGreaterThan(0);
 const retired=graph.taskObjects.filter(o=>Number(o.title.slice(prefix.length))<12);
 const result={fixtureTasks:100,edits:42,undoLimit:30,bytes,counts,retired:retired.slice(0,15),retiredCount:retired.length,current:graph.taskObjects.filter(o=>o.title===prefix+'42').slice(0,3),snapshotNodes:graph.snapshotNodes,method:graph.method,errors};
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/ui-retainer-final.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({bytes,counts,retiredCount:retired.length,snapshotNodes:graph.snapshotNodes}));
 // The initial render still has a bounded toolbar callback root; no edited
 // version older than the 30-step history window may be retained.
 expect(retired.filter(o=>o.title!==prefix+'00')).toHaveLength(0);
 expect(retired.length).toBeLessThanOrEqual(1);await cdp.detach();
});
