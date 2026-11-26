import {test,expect} from '@playwright/test';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY,dayKey} from '../src/domain.js';
import {mkdirSync,writeFileSync} from 'node:fs';
test.skip(process.env.TODO_IDB_PILOT!=='1'||process.env.TODO_SUSTAINED!=='1','Explicit isolated sustained test budget required');
test.use({serviceWorkers:'block',reducedMotion:'reduce'});
test('万级分片工作空间持续修改及堆分配采样',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','CDP profiling');const hourly=process.env.TODO_HOUR_SOAK==='1';test.setTimeout(hourly?3900000:150000);
 const key=STORAGE_KEY,bkey=BACKUP_KEY,path='/src/services/web-workspace-shards.js',legacy=JSON.stringify(initialState()),raw=JSON.stringify({...initialState(),tasks:Array.from({length:10000},(_,i)=>newTask('剖析任务 '+String(i).padStart(5,'0'),'inbox',dayKey(),'profile-'+i))});
 await page.route('**/shard-profile-probe',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Shard profile</title>'}));await page.goto('/shard-profile-probe');
 await page.evaluate(async({path,key,bkey,legacy,raw})=>{const m=await import(path),db=await m.openShardDatabase();localStorage.setItem(key,legacy);const first=await m.migrateShardWorkspace(db,'guest',localStorage,await m.sourceDigest({[key]:legacy}));await m.commitShardWorkspace(db,first,{[key]:raw,[bkey]:raw,[bkey+'-at']:String(Date.now())},localStorage);db.close();sessionStorage.setItem('todo-idb-pilot','synthetic-v2')},{path,key,bkey,legacy,raw});
 await page.goto('/');await expect(page.getByText('已提交工作空间 · 有效')).toBeVisible();mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/shard-recovery-desktop.png',animations:'disabled'});await page.setViewportSize({width:320,height:844});await page.screenshot({path:'test-results/shard-recovery-mobile.png',animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'打开试验工作空间'}).click();await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible();
 const cdp=await context.newCDPSession(page),errors=[],samples=[];page.on('pageerror',e=>errors.push(e.message));
 const input=page.getByRole('textbox',{name:'新任务名称'}),rail=page.locator('.rail');
 const cycle=async(i)=>{await input.fill('分片运行新增 '+i);await input.press('Enter');await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible();await rail.getByRole('button',{name:'看板',exact:true}).click();await expect(page.locator('.board-column').first()).toBeVisible({timeout:20000});expect(await page.locator('.board-task-card').count()).toBeLessThanOrEqual(60);await rail.getByRole('button',{name:'任务',exact:true}).click();await expect(input).toBeVisible()};
 await cycle(0);await rail.getByRole('button',{name:'看板',exact:true}).click();const nav=page.getByRole('navigation',{name:'待处理分页'});await nav.getByRole('textbox',{name:'待处理前往页码'}).fill('167');await nav.getByRole('button',{name:'待处理跳转'}).click();await expect(nav).toContainText('9961–10001 / 10001');await expect(page.locator('[data-board-task=profile-9999]')).toBeVisible();await rail.getByRole('button',{name:'任务',exact:true}).click();await expect(input).toBeVisible();const start=performance.now();
 const sample=async(i)=>{await cdp.send('HeapProfiler.collectGarbage');const {usedSize,totalSize}=await cdp.send('Runtime.getHeapUsage');samples.push({cycle:i,elapsedMs:performance.now()-start,usedSize,totalSize,domNodes:await page.evaluate(()=>document.getElementsByTagName('*').length)})};await sample(0);
 await cdp.send('HeapProfiler.startSampling',{samplingInterval:65536});
 let rounds=0;while(hourly?performance.now()-start<3600000:rounds<10){
  rounds++;await cycle(rounds);await page.waitForTimeout(hourly?30000:4000);
  if(rounds%2===0){await sample(rounds);if(hourly){writeFileSync('test-results/shard-hour-progress.json',JSON.stringify({complete:false,elapsedMs:performance.now()-start,rounds,samples,errors},null,2));expect(errors).toEqual([])}}
 }
 if(samples.at(-1).cycle!==rounds)await sample(rounds);
 if(hourly)expect(performance.now()-start).toBeGreaterThanOrEqual(3600000);
 const {profile}=await cdp.send('HeapProfiler.stopSampling');const allocations=[];const walk=n=>{if(n.selfSize)allocations.push({name:n.callFrame.functionName||'(anonymous)',url:n.callFrame.url.replace(/^http:\/\/127\.0\.0\.1:4178/,'').split('?')[0],bytes:n.selfSize});for(const child of n.children||[])walk(child)};walk(profile.head);allocations.sort((a,b)=>b.bytes-a.bytes);
 const saved=await page.evaluate(async({path,key})=>{const m=await import(path),db=await m.openShardDatabase();try{return JSON.parse((await m.readShardWorkspace(db,'guest')).values[key]).tasks.length}finally{db.close()}},{path,key});expect(saved).toBe(10001+rounds);expect(errors).toEqual([]);
 const result={tasks:10000,added:rounds+1,cycles:rounds,switches:2*(rounds+1),elapsedMs:performance.now()-start,samples,allocationSamples:allocations.slice(0,15),errors,saved,method:hourly?'hourly, 30s dwell, GC every 2 cycles; intended undo history retained':'warm one cycle then ten cycles; 4s dwell; forced GC every 2 cycles; sampled allocations are not retainer paths; undo retains intended history'};
 writeFileSync(hourly?'test-results/shard-hour-final.json':'test-results/shard-lifecycle.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
});
