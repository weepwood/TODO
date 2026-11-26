import {test,expect} from '@playwright/test';
import {initialState,newTask,STORAGE_KEY,BACKUP_KEY,dayKey} from '../src/domain.js';
import {mkdirSync,writeFileSync} from 'node:fs';
test.skip(process.env.TODO_IDB_PILOT!=='1'||process.env.TODO_FIXED_COUNT!=='1','Explicit isolated performance budget required');
test.use({serviceWorkers:'block',reducedMotion:'reduce'});
test('万级固定任务数量的导航与重复编辑对照',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','CDP heap sampling');
 test.setTimeout(900000);
 const key=STORAGE_KEY,bkey=BACKUP_KEY,path='/src/services/web-workspace-shards.js';
 const legacy=JSON.stringify(initialState()),raw=JSON.stringify({...initialState(),tasks:Array.from({length:10000},(_,i)=>newTask('固定样本 '+String(i).padStart(5,'0'),'inbox',dayKey(),'fixed-'+i))});
 await page.route('**/fixed-count-probe',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixed count</title>'}));await page.goto('/fixed-count-probe');
 await page.evaluate(async({path,key,bkey,legacy,raw})=>{
  const m=await import(path),db=await m.openShardDatabase();localStorage.setItem(key,legacy);const first=await m.migrateShardWorkspace(db,'guest',localStorage,await m.sourceDigest({[key]:legacy}));
  await m.commitShardWorkspace(db,first,{[key]:raw,[bkey]:raw,[bkey+'-at']:String(Date.now())},localStorage);db.close();sessionStorage.setItem('todo-idb-pilot','synthetic-v2');
 },{path,key,bkey,legacy,raw});
 await page.goto('/');await page.getByRole('button',{name:'打开试验工作空间'}).click();await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible();
 const first=page.locator('[data-row-id]').first();await expect(first).toBeVisible();const id=await first.getAttribute('data-row-id');expect(id).toMatch(/^fixed-\d+$/);
 const row=page.locator('[data-row-id="'+id+'"]'),rail=page.locator('.rail'),errors=[],samples=[];page.on('pageerror',e=>errors.push(e.message));
 const cdp=await context.newCDPSession(page),start=performance.now();
 const read=()=>page.evaluate(async({path,key,id})=>{
  const m=await import(path),db=await m.openShardDatabase();try{const raw=(await m.readShardWorkspace(db,'guest')).values[key],state=JSON.parse(raw),task=state.tasks.find(t=>t.id===id);return {count:state.tasks.length,bytes:new TextEncoder().encode(raw).length,activity:task.activity?.length||0,title:task.title}}finally{db.close()}
 },{path,key,id});
 const sample=async(phase,round)=>{const persisted=await read();expect(persisted.count).toBe(10000);await cdp.send('HeapProfiler.collectGarbage');const {usedSize,totalSize}=await cdp.send('Runtime.getHeapUsage');samples.push({phase,round,elapsedMs:performance.now()-start,usedSize,totalSize,domNodes:await page.evaluate(()=>document.getElementsByTagName('*').length),...persisted})};
 const switchViews=async()=>{await rail.getByRole('button',{name:'看板',exact:true}).click();await expect(page.locator('.board-column').first()).toBeVisible();expect(await page.locator('.board-task-card').count()).toBeLessThanOrEqual(60);await rail.getByRole('button',{name:'任务',exact:true}).click();await expect(row).toBeVisible()};
 await switchViews();await sample('navigation',0);
 for(let i=1;i<=12;i++){await switchViews();await page.waitForTimeout(1000);if(i%4===0)await sample('navigation',i)}
 await sample('edit',0);
 for(let i=1;i<=48;i++){
  const title='固定样本改名 '+String(i%2).padStart(2,'0');
  await row.locator('.task-title-text').click();const input=page.getByRole('textbox',{name:'行内任务标题'});await input.fill(title);await input.press('Enter');
  await expect(row.locator('.task-title-text')).toHaveText(title);await expect(page.getByText('IndexedDB 已保存',{exact:false})).toBeVisible();
  await switchViews();await page.waitForTimeout(1000);if(i%4===0){await sample('edit',i);expect(samples.at(-1).title).toBe(title);expect(errors).toEqual([])}
 }
 const final=await read();expect(final.count).toBe(10000);expect(errors).toEqual([]);
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/rc-fixed-count.json',JSON.stringify({tasks:10000,taskId:id,samples,final,errors,method:'Same synthetic UI session, navigation-only then fixed-count edits; activity bytes and undo history retained; phase order not randomized; no leak claim'},null,2));
 await cdp.detach();
});
