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
    if(cmd==='native_search'){window.__testSearch=(window.__testSearch||0)+1;const store=JSON.parse(localStorage.getItem('test-sqlite-'+args.scope));return JSON.parse(store['todo-workbench-v1']).tasks.filter(t=>(t.title+' '+t.notes).includes(args.query)).map(t=>t.id)}
    if(cmd==='native_list_backups')return [{saved_at:1760000000,bytes:1234}];
    if(cmd==='native_read_backup')return JSON.stringify(legacy);
    if(cmd==='native_create_backup')return null;
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
 await page.getByRole('button',{name:'全局搜索',exact:true}).click();await page.getByRole('combobox',{name:'搜索命令与任务'}).fill('等待保存');await expect(page.getByRole('option').filter({hasText:'等待保存的任务'})).toBeVisible();await page.getByRole('button',{name:'查看全部任务结果'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__testSearch||0)).toBeGreaterThan(0);
 await expect(page.locator('.task-body').filter({hasText:'等待保存的任务'})).toBeVisible();
 await page.getByRole('button',{name:'清除搜索',exact:true}).click();
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();
 await page.getByRole('button',{name:'SQLite 备份历史',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'SQLite 备份历史'})).toBeVisible();
 await page.getByRole('button',{name:'恢复',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'确认恢复工作空间'})).toBeVisible();
 await page.getByRole('button',{name:'确认恢复'}).click();
 await expect(page.locator('.task-body').filter({hasText:'等待保存的任务'})).toHaveCount(0);
});
