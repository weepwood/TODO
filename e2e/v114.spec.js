import {test,expect} from '@playwright/test';
test('命令面板多词搜索、键盘选择及任务直达',async({page})=>{
 await page.goto('/');
 for(const title of ['命令测试甲','命令测试乙']){await page.getByRole('textbox',{name:'新任务名称'}).fill(title);await page.getByRole('button',{name:'添加',exact:true}).click()}
 await page.locator('.rail').getByRole('button',{name:'命令面板',exact:true}).click();
 const search=page.getByRole('combobox',{name:'搜索命令与任务'});await search.fill('命令测试 收集箱');
 await expect(page.getByRole('option')).toHaveCount(2);await page.keyboard.press('ArrowDown');await expect(page.getByRole('option',{selected:true})).toContainText('命令测试乙');await page.keyboard.press('Enter');
 await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('命令测试乙');
 await page.locator('.rail').getByRole('button',{name:'命令面板',exact:true}).click();await search.fill('找不到的内容');await expect(page.getByText('没有匹配结果')).toBeVisible();await page.keyboard.press('Escape');
});
test('直接日期输入与数字字段仅提交有效值',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'新任务名称'}).fill('控件测试');await page.getByRole('button',{name:'添加',exact:true}).click();
 const number=page.getByRole('spinbutton',{name:'预计分钟'});await number.fill('');await number.blur();await expect(number).toHaveValue('30');
 await number.fill('123');await number.press('Enter');await expect(number).toHaveValue('123');await number.fill('45');await number.press('Escape');await expect(number).toHaveValue('123');
 await page.getByRole('button',{name:'计划日期',exact:true}).click();await page.getByText('手动输入日期',{exact:true}).click();await page.getByLabel('计划日期直接输入').fill('2026-12-10');await page.getByRole('button',{name:'应用',exact:true}).click();await page.getByRole('dialog',{name:'计划日期选择器'}).getByRole('button',{name:'确定',exact:true}).click();await expect(page.getByRole('button',{name:'计划日期',exact:true})).toContainText('2026-12-10');
});
test('独立录入页仅通过受限 IPC 交接草稿（模拟 IPC）',async({page})=>{
 await page.addInitScript(()=>{window.isTauri=true;window.__calls=[];window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{window.__calls.push({cmd,args});if(cmd==='native_capture_generation')return 7;if(cmd==='plugin:event|listen')return 1;if(cmd==='native_capture_handoff')return null;return null}}});
 await page.setViewportSize({width:520,height:315});await page.goto('/capture.html');await page.getByLabel('任务内容').fill('录入验收 明天 09:30 !2');
 await expect(page.locator('.preview')).toContainText('09:30');
 await expect(page.getByRole('button',{name:'在主窗口确认'})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);await page.screenshot({path:'test-results/v114-capture.png',animations:'disabled'});
 await page.getByRole('button',{name:'在主窗口确认'}).click();await expect(page.getByLabel('任务内容')).toHaveValue('');
 const calls=await page.evaluate(()=>window.__calls);expect(calls.find(x=>x.cmd==='native_capture_handoff').args).toEqual({generation:7,text:'录入验收 明天 09:30 !2'});
 expect(calls.every(x=>['plugin:event|listen','native_capture_generation','native_capture_handoff','native_capture_direct_status'].includes(x.cmd))).toBe(true);
});
test('非桌面页面不启用独立录入 IPC',async({page})=>{
 await page.goto('/capture.html');await expect(page.getByText('独立录入仅适用于 TODO 桌面版。')).toBeVisible();await expect(page.getByRole('button',{name:'在主窗口确认'})).toHaveCount(0);
});

test('日历日视图及周视图可通过任务栏精确安排时间',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'新建任务',exact:true}).click();await page.getByRole('textbox',{name:'快速任务名称'}).fill('日历时间安排');await page.getByRole('button',{name:'创建任务',exact:true}).click();
 await page.getByRole('button',{name:'日历',exact:true}).click();await page.getByLabel('联动日期').fill('2026-12-10');
 await page.locator('.calendar-main').getByText('日',{exact:true}).click();
 await page.getByRole('button',{name:'待安排',exact:true}).click();await page.getByLabel('待安排任务时间',{exact:true}).fill('09:15');
 await page.getByRole('button',{name:'安排 日历时间安排',exact:true}).click();
 await page.getByRole('button',{name:'选定日期',exact:true}).click();await expect(page.locator('.agenda-title').filter({hasText:'日历时间安排'})).toContainText('09:15');
 await page.locator('.calendar-main').getByText('周',{exact:true}).click();await expect(page.getByLabel('联动日期')).toHaveValue('2026-12-10');
 await expect(page.locator('.agenda-title').filter({hasText:'日历时间安排'})).toHaveCount(1);
});
test('主窗口接收草稿后仅在显式确认时创建任务（模拟 IPC）',async({page})=>{
 await page.addInitScript(()=>{
  window.isTauri=true;window.__writes=0;let pending='独立录入草稿 明天 10:00';
  window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{
   if(cmd==='native_load_store')return localStorage.getItem('qa-capture-store');
   if(cmd==='native_load')return null;
   if(cmd==='native_write_store'){window.__writes++;localStorage.setItem('qa-capture-store',args.store);return null}
   if(cmd==='native_take_quick_capture'){const value=pending;pending=null;return value}
   if(cmd==='plugin:event|listen')return 1;
   return null;
  }};
 });
 await page.goto('/');await expect(page.getByRole('textbox',{name:'快速任务名称'})).toHaveValue('独立录入草稿 明天 10:00');
 const stored=()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('qa-capture-store'))['todo-workbench-v1']).tasks);
 expect(await stored()).toHaveLength(0);
 await page.getByRole('button',{name:'创建任务',exact:true}).click();await expect.poll(async()=> (await stored()).length).toBe(1);
 expect((await stored())[0].title).toBe('独立录入草稿');expect((await stored())[0].time).toBe('10:00');
});
