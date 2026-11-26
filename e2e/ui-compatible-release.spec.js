import {test,expect} from '@playwright/test';
import {initialState,newTask,STORAGE_KEY,dayKey} from '../src/domain.js';
test.skip(process.env.TODO_IDB_PILOT!=='1','isolated synthetic only');
test('实际旧应用写入、跨标签切换锁和新版迁移回退',async({page,context})=>{
 const raw=JSON.stringify({...initialState(),tasks:[newTask('旧版原始任务','inbox',dayKey(),'release-old')]});
 await page.addInitScript(({key,raw})=>{if(!localStorage.getItem(key))localStorage.setItem(key,raw);sessionStorage.setItem('todo-idb-pilot','synthetic-legacy-compatible')},{key:STORAGE_KEY,raw});
 await page.goto('/');const input=page.getByRole('textbox',{name:'新任务名称'});await expect(input).toBeVisible();
 await page.evaluate(async()=>{await navigator.serviceWorker.register('/audit-legacy-sw.js');await navigator.serviceWorker.ready});
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await input.fill('合作旧版实际新增');await input.press('Enter');await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).tasks.some(t=>t.title==='合作旧版实际新增'),STORAGE_KEY)).toBe(true);
 const second=await context.newPage();await second.addInitScript(()=>sessionStorage.setItem('todo-idb-pilot','synthetic-v2'));await second.goto('/');await expect(second.getByText('隔离工作空间无法取得独占锁')).toBeVisible();
 // Simulate a marker observed by an already-open cooperating client.
 const saved=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
 await page.evaluate(async()=>{const p=await import('/src/services/storage-switch-protocol.js'),m=await import('/src/services/web-workspace-shards.js'),v=await import('/src/services/web-workspace-store.js');p.setSwitch(localStorage,'preparing',await m.sourceDigest(v.legacySnapshot(localStorage)))});
 await input.fill('不得覆盖的旧版草稿');await input.press('Enter');await expect(page.getByRole('alert').filter({hasText:'本地保存失败'})).toBeVisible();expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(saved);
 // Close the old test page without discarding any real data; the synthetic draft
 // must be exported before opening a migrated workspace.
 const dl=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前数据',exact:true}).click();await dl;
 page.on('dialog',d=>d.accept());await page.close({runBeforeUnload:true});await expect.poll(()=>page.isClosed()).toBe(true);
 await second.reload();await expect(second.getByRole('alert')).toContainText('PWA 工作线程版本不兼容');
 await second.evaluate(async()=>{for(const registration of await navigator.serviceWorker.getRegistrations())await registration.unregister()});
 await second.close();
 const migrated=await context.newPage();await migrated.addInitScript(()=>sessionStorage.setItem('todo-idb-pilot','synthetic-v2'));await migrated.goto('/');await expect(migrated.getByRole('checkbox',{name:'确认仅复制隔离工作空间'})).toBeVisible();await migrated.getByRole('checkbox',{name:'确认仅复制隔离工作空间'}).check();await migrated.getByRole('button',{name:'确认迁移'}).click();await expect(migrated.getByText('版本 1 · 2 项任务')).toBeVisible();
 await migrated.getByRole('button',{name:'检查并无损回退'}).click();await expect(migrated.getByText('已提交工作空间 · 已回退')).toBeVisible();
 expect(await migrated.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(saved);
 await migrated.close();const old=await context.newPage();await old.addInitScript(()=>sessionStorage.setItem('todo-idb-pilot','synthetic-legacy-compatible'));await old.goto('/');await expect(old.getByRole('alert')).toContainText('旧模式禁止写入');
});
