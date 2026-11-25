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
