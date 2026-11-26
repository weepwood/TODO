import {test,expect} from '@playwright/test';
test('离线应用壳可重新加载，访客任务保持本地保存',async({page,context})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'新任务名称'}).fill('离线任务');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 await expect(page.locator('.task-body').filter({hasText:'离线任务'})).toBeVisible();
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await context.setOffline(true);await page.reload();
 await expect(page.locator('.task-body').filter({hasText:'离线任务'})).toBeVisible();
 await page.getByRole('textbox',{name:'新任务名称'}).fill('离线新增');await page.getByRole('button',{name:'添加',exact:true}).click();
 await expect(page.locator('.task-body').filter({hasText:'离线新增'})).toBeVisible();
 await context.setOffline(false);
});

import {initialState,newTask,dayKey} from '../src/domain.js';
test('首次打开按需加载的任务详情也支持离线',async({page,context})=>{
 const state=initialState();state.tasks=[newTask('首次离线详情','inbox',dayKey())];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();
 await page.evaluate(()=>navigator.serviceWorker.ready);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await context.setOffline(true);await page.reload();
 await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'首次离线详情'}).click();
 await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('首次离线详情');await expect(page.locator('[data-detail-section]')).toHaveCount(8);
 await context.setOffline(false);
});
