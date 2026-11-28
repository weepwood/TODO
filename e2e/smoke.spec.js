import {test,expect} from '@playwright/test';
test('任务创建、持久化、完成、右键回收站及各模块',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).fill('浏览器验收任务');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('浏览器验收任务');
 await page.getByRole('textbox',{name:'任务备注'}).fill('持久化内容');
 await page.reload();
 await page.locator('.task-body').filter({hasText:'浏览器验收任务'}).click();
 await expect(page.getByRole('textbox',{name:'任务备注'})).toHaveValue('持久化内容');
 await page.getByRole('button',{name:'完成 浏览器验收任务'}).click();
 await page.locator('.nav-row').filter({hasText:'已完成'}).click();
 await page.locator('.task-body').filter({hasText:'浏览器验收任务'}).click({button:'right'});
 await page.getByRole('menuitem',{name:'移入回收站'}).click();
 await page.locator('.nav-row').filter({hasText:'回收站'}).click();
 await expect(page.locator('.task-body').filter({hasText:'浏览器验收任务'})).toBeVisible();
 for(const name of ['日历','看板','四象限','每日规划','专注','习惯','统计']){
  await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
 }
 expect(errors).toEqual([]);
});

test('数据导入、自动备份及异常数据保护',async({page})=>{
 await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).waitFor();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('todo-workbench-v1'))).not.toBeNull();
 const payload=await page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
 await page.getByRole('textbox',{name:'新任务名称'}).fill('导入前任务');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();
 await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":99}')});
 await expect(page.locator('.toast')).toContainText('导入失败');
 await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
 await expect(page.getByRole('dialog',{name:'确认恢复工作空间'})).toBeVisible();
 await page.getByRole('button',{name:'确认恢复'}).click();
 await expect(page.locator('.task-body').filter({hasText:'导入前任务'})).toHaveCount(0);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();
 await page.getByRole('button',{name:'恢复自动备份'}).click();
 await page.getByRole('button',{name:'确认恢复'}).click();
 await expect(page.locator('.task-body').filter({hasText:'导入前任务'})).toBeVisible();
 await page.evaluate(()=>localStorage.setItem('todo-workbench-v1','broken'));
 await page.reload();
 await expect(page.getByRole('alert')).toContainText('自动保存已停止');
 expect(await page.evaluate(()=>localStorage.getItem('todo-workbench-v1'))).toBe('broken');
});
