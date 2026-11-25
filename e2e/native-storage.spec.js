import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
test('桌面 IPC 模拟：旧存储迁移、SQLite 优先与保存失败重试',async({page})=>{
 const task=newTask('旧 WebView 任务','inbox',dayKey());
 const legacy={...initialState(),tasks:[task]},mirror={...legacy,tasks:[{...task,title:'旧 SQLite 任务'}]};
 await page.addInitScript(({legacy,mirror})=>{
  window.isTauri=true;window.__testFail=false;
  if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(legacy));
  window.__TAURI_INTERNALS__={
   transformCallback:()=>1,
   invoke:async(cmd,args)=>{
    if(cmd==='native_load_store')return localStorage.getItem('test-sqlite-'+args.scope);
    if(cmd==='native_load')return JSON.stringify(mirror);
    if(cmd==='native_write_store'){if(window.__testFail)throw Error('模拟磁盘写入失败');localStorage.setItem('test-sqlite-'+args.scope,args.store);return null}
    if(cmd==='plugin:event|listen')return 1;
    return null
   }
  }
 },{legacy,mirror});
 await page.goto('/');
 await expect(page.locator('.task-body').filter({hasText:'旧 WebView 任务'})).toBeVisible();
 const persisted=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('test-sqlite-guest')));
 expect(JSON.parse((await persisted())['todo-native-migration-backup']).tasks[0].title).toBe('旧 SQLite 任务');
 await page.evaluate(()=>{window.__testFail=true});
 await page.getByRole('textbox',{name:'新任务名称'}).fill('等待保存的任务');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 await expect(page.getByText(/SQLite 保存失败：/)).toBeVisible();
 expect(JSON.parse((await persisted())['todo-workbench-v1']).tasks.length).toBe(1);
 await page.evaluate(()=>{window.__testFail=false});
 await page.getByRole('button',{name:'重试保存'}).click();
 await expect.poll(async()=>JSON.parse((await persisted())['todo-workbench-v1']).tasks.length).toBe(2);
 await page.reload();
 await expect(page.locator('.task-body').filter({hasText:'等待保存的任务'})).toBeVisible();
 expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('todo-workbench-v1'))).tasks.length).toBe(1);
});
