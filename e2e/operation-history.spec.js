import {test,expect} from '@playwright/test';
import path from 'node:path';
test('现有历史入口展示版本、选择性恢复与实际应用确认（模拟 IPC）',async({page})=>{
 await page.addInitScript(()=>{
  window.isTauri=true;window.__qaJournal=null;window.__qaRequest=null;
  window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{
   if(cmd==='native_load_store')return localStorage.getItem('qa-history-store');
   if(cmd==='native_load')return null;
   if(cmd==='native_write_store'){localStorage.setItem('qa-history-store',args.store);return null}
   if(cmd==='native_operation_history'){
    const raw=JSON.parse(localStorage.getItem('qa-history-store'))['todo-workbench-v1'];
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),x=>x.toString(16).padStart(2,'0')).join('');
    return {...window.__qaJournal,workspaceFingerprint:hash};
   }
   if(cmd==='native_cli_next')return window.__qaRequest;
   if(cmd==='native_cli_write_store'){localStorage.setItem('qa-history-store',args.store);window.__qaReceipt=args.receipt;window.__qaRequest=null;return null}
   if(cmd==='plugin:event|listen')return 1;return null;
  }};
 });
 await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).fill('历史测试任务');await page.getByRole('button',{name:'添加',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('qa-history-store'))['todo-workbench-v1']).tasks.length)).toBe(1);
 await page.evaluate(()=>{
  const t=JSON.parse(JSON.parse(localStorage.getItem('qa-history-store'))['todo-workbench-v1']).tasks[0];
  const groupId='00000000-0000-4000-8000-000000000123';
  window.__qaJournal={intact:true,head:2,entries:[{version:2,at:Date.now()/1000,source:'cli',groupId,kind:'update',count:1,body:{rows:[{id:t.id,fields:{title:{before:{present:true,value:'历史中间标题'+('非常长的连续字段用于验证自动换行'.repeat(12))},after:{present:true,value:t.title}}},protected:[]}],protectedWorkspace:[]}},{version:1,at:Date.now()/1000,source:'cli',groupId,kind:'update',count:1,body:{rows:[{id:t.id,fields:{title:{before:{present:true,value:'历史旧标题'},after:{present:true,value:'历史中间标题'+('非常长的连续字段用于验证自动换行'.repeat(12))}}},protected:[]}],protectedWorkspace:[]}}]};
 });
 await page.locator('.rail').getByRole('button',{name:'命令面板',exact:true}).click();
 await page.getByRole('combobox',{name:'搜索命令与任务'}).fill('历史归档检索');
 await page.keyboard.press('Enter');
 await page.getByText('操作版本与恢复（本机）',{exact:true}).click();
 await expect(page.getByText('V1 · CLI')).toBeVisible();
 await page.getByRole('combobox',{name:'版本来源'}).selectOption('local');
 await expect(page.getByText('显示 0 / 2 个版本')).toBeVisible();
 await page.getByRole('combobox',{name:'版本来源'}).selectOption('group');
 await expect(page.getByText('显示 2 / 2 个版本')).toBeVisible();
 await page.getByRole('button',{name:'版本详情',exact:true}).first().click();
 await expect(page.getByText('V2 · 版本详情')).toBeVisible();
 await expect(page.getByText('任务名称',{exact:true})).toBeVisible();
 const screenshots=process.env.HISTORY_QA_SCREENSHOTS;
 if(screenshots)await page.getByRole('dialog').screenshot({path:path.join(screenshots,'history-desktop-light.png')});
 await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.locator('.operation-history .history-diff-values').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await expect.poll(()=>page.locator('.operation-history').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 if(screenshots)await page.getByRole('dialog').screenshot({path:path.join(screenshots,'history-narrow-dark.png')});
 await page.getByRole('button',{name:'关闭详情'}).click();
 await page.getByRole('button',{name:'恢复操作组',exact:true}).first().click();
 await expect(page.getByText(/恢复预览 · 1 项可恢复/)).toBeVisible();
 await expect(page.getByText(/历史旧标题/)).toBeVisible();
 if(screenshots)await page.getByRole('dialog').screenshot({path:path.join(screenshots,'history-preview-dark.png')});
 await page.getByRole('button',{name:'确认恢复所示变更'}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('qa-history-store'))['todo-workbench-v1']).tasks[0].title)).toBe('历史旧标题');
});
