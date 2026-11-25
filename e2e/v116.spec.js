import {test,expect} from '@playwright/test';
test('直接录入仅在本地保存成功后确认，失败恢复不重复任务（模拟 IPC）',async({page})=>{
 await page.addInitScript(()=>{
  window.isTauri=true;window.__fail=false;window.__acked=0;window.__request=null;
  window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{
   if(cmd==='native_load_store')return localStorage.getItem('qa-direct-store');
   if(cmd==='native_load')return null;
   if(cmd==='native_write_store'){if(window.__fail)throw Error('测试写入失败');localStorage.setItem('qa-direct-store',args.store);return null}
   if(cmd==='native_direct_pending')return window.__request;
   if(cmd==='native_direct_ack'){const tasks=JSON.parse(JSON.parse(localStorage.getItem('qa-direct-store'))['todo-workbench-v1']).tasks;if(tasks.some(t=>t.id===args.id)){window.__acked++;window.__request=null;return true}return false}
   if(cmd==='plugin:event|listen')return 1;return null;
  }};
 });
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();
 await page.evaluate(()=>{window.__fail=true;window.__request={scope:'guest',generation:5,id:'00000000-0000-4000-8000-000000000021',text:'直接录入验收 今天 10:00'}});
 await expect(page.getByText(/SQLite 保存失败：/)).toBeVisible({timeout:8000});
 expect(await page.evaluate(()=>window.__acked)).toBe(0);
 await page.evaluate(()=>window.__fail=false);await page.getByRole('button',{name:'重试保存'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__acked),{timeout:8000}).toBe(1);
 const tasks=await page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('qa-direct-store'))['todo-workbench-v1']).tasks);
 expect(tasks).toHaveLength(1);expect(tasks[0].title).toBe('直接录入验收');
});
test('独立窗口直接提交显示待保存，确认前禁止重复（模拟 IPC）',async({page})=>{
 await page.addInitScript(()=>{window.isTauri=true;window.__calls=[];window.__status='idle';window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{if(cmd==='native_capture_generation')return 9;if(cmd==='native_capture_direct_status')return window.__status;if(cmd==='native_capture_submit_direct'){window.__calls.push(args);window.__status='pending'}if(cmd==='plugin:event|listen')return 1;return null}}});
 await page.setViewportSize({width:520,height:315});await page.goto('/capture.html');await page.getByLabel('任务内容').fill('直接创建 明天 09:00');
 await page.getByRole('button',{name:'直接创建',exact:true}).click();await expect(page.getByRole('status')).toContainText('等待本机保存确认');await expect(page.getByRole('button',{name:'保存中…'})).toBeDisabled();
 await page.evaluate(()=>window.__status='saved');await expect(page.getByRole('status')).toContainText('已保存到本机');expect(await page.evaluate(()=>window.__calls.length)).toBe(1);
 await page.screenshot({path:'test-results/v116-direct.png',animations:'disabled'});
});
test('命令面板非连续字符搜索、最近使用及关闭详情焦点恢复',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'新任务名称'}).fill('项目文档整理');await page.getByRole('button',{name:'添加',exact:true}).click();
 await page.locator('.rail').getByRole('button',{name:'命令面板',exact:true}).click();await page.getByRole('combobox',{name:'搜索命令与任务'}).fill('项文整');
 await expect(page.getByRole('option')).toHaveCount(1);await page.keyboard.press('Enter');await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('项目文档整理');
 await page.getByRole('button',{name:'关闭详情'}).click();await expect(page.locator('.task-body').filter({hasText:'项目文档整理'})).toBeFocused();
 await page.locator('.rail').getByRole('button',{name:'命令面板',exact:true}).click();await expect(page.getByRole('option').first()).toContainText('项目文档整理');
});

test('保存前撤销直接录入后终止请求，不重新插入（模拟 IPC）',async({page})=>{
 await page.addInitScript(()=>{
  window.isTauri=true;window.__fail=false;window.__request=null;window.__cancelled=0;window.__acked=0;
  window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{
   if(cmd==='native_load_store')return localStorage.getItem('qa-undo-store');
   if(cmd==='native_load')return null;
   if(cmd==='native_write_store'){if(window.__fail)throw Error('测试写入失败');localStorage.setItem('qa-undo-store',args.store);return null}
   if(cmd==='native_direct_pending')return window.__request;
   if(cmd==='native_direct_ack'){window.__acked++;return false}
   if(cmd==='native_direct_cancel_pending'){window.__cancelled++;window.__request=null;return true}
   if(cmd==='plugin:event|listen')return 1;return null;
  }};
 });
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();
 await page.evaluate(()=>{window.__fail=true;window.__request={scope:'guest',generation:5,id:'00000000-0000-4000-8000-000000000022',text:'撤销录入 今天 10:00'}});
 await expect(page.getByText(/SQLite 保存失败：/)).toBeVisible({timeout:8000});
 await page.evaluate(()=>{document.activeElement?.blur();window.__fail=false});
 await page.keyboard.press('Control+z');
 await expect(page.locator('.task-body').filter({hasText:'撤销录入'})).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>window.__cancelled),{timeout:8000}).toBe(1);
 expect(await page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('qa-undo-store'))['todo-workbench-v1']).tasks)).toHaveLength(0);
});
