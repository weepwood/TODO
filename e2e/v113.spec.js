import {chooseOption} from './select-helper.js';
import {test,expect} from '@playwright/test';
test('行内标题编辑、取消、复制与跨清单移动',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'新任务名称'}).fill('原任务');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 const row=page.locator('.task-body').filter({hasText:'原任务'});
 await row.locator('.task-title-text').click();const input=page.getByLabel('行内任务标题');await expect(input).toBeFocused();
 await input.fill('取消修改');await page.keyboard.press('Escape');await expect(row).toBeVisible();
 await row.locator('.task-title-text').click();await input.fill('');await input.press('Enter');await expect(page.getByRole('alert')).toContainText('标题不能为空');
 await input.fill('行内已保存');await page.keyboard.press('Enter');
 const edited=page.locator('.task-body').filter({hasText:'行内已保存'});
 await expect(edited).toBeVisible();await edited.click({button:'right'});await page.getByRole('menuitem',{name:'复制任务'}).click();
 const copy=page.locator('.task-body').filter({hasText:'行内已保存（副本）'});await expect(copy).toBeVisible();
 await copy.click({button:'right'});await page.getByRole('menuitem',{name:'移动到清单'}).click();await chooseOption(page.getByLabel('移动目标清单'),'work');await page.getByRole('button',{name:'确认移动'}).click();await expect(copy).toBeVisible();await expect(page.locator('.nav-row.active')).toContainText('工作');
});
test('快速录入解析预览与语义弹窗',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'新建任务',exact:true}).click();
 await page.getByLabel('快速任务名称').fill('查看项目 明天 09:30 !2');
 await expect(page.getByLabel('录入解析预览')).toContainText('查看项目');await expect(page.getByLabel('录入解析预览')).toContainText('09:30');await expect(page.getByRole('dialog')).toHaveAccessibleDescription(/自然语言日期/);
 await page.screenshot({path:'test-results/v113-capture.png',animations:'disabled'});
});
