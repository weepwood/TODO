import {test,expect} from '@playwright/test';
test('正负积分设置、任务完成、统计、清单过滤与撤销',async({page})=>{
 await page.goto('/');
 for(const title of ['阅读 积分+10','熬夜 积分-5']){await page.getByRole('textbox',{name:'新任务名称'}).fill(title);await page.getByRole('button',{name:'添加',exact:true}).click()}
 await expect(page.getByRole('spinbutton',{name:'任务积分'})).toHaveValue('-5');
 const field=page.getByRole('spinbutton',{name:'任务积分'});await field.fill('-3');await field.press('Enter');
 await expect(page.locator('.task-row').filter({hasText:'熬夜'}).locator('.task-points')).toHaveText('-3 分');
 await page.getByRole('button',{name:'完成 阅读',exact:true}).click();await page.getByRole('button',{name:'完成 熬夜',exact:true}).click();
 await page.locator('.rail').getByRole('button',{name:'统计',exact:true}).click();
 const stats=page.getByLabel('积分统计');await expect(stats.locator('.points-metrics>div').filter({hasText:'区间净积分'})).toContainText('+7');
 await expect(stats.locator('.points-metrics>div').filter({hasText:'区间获得'})).toContainText('+10');await expect(stats.locator('.points-metrics>div').filter({hasText:'区间扣除'})).toContainText('-3');
 await page.getByLabel('积分明细筛选').selectOption('negative');await expect(stats.locator('.points-entry')).toHaveCount(1);await expect(stats.locator('.points-entry')).toContainText('熬夜');
 await page.screenshot({path:'test-results/points-light.png',animations:'disabled'});
 await page.locator('.stats-toolbar select').last().selectOption('work');await expect(stats.locator('.points-metrics>div').filter({hasText:'区间净积分'})).toContainText('0');
 await page.locator('.rail').getByRole('button',{name:'任务',exact:true}).click();await page.locator('.nav-row').filter({hasText:'已完成'}).click();
 await page.locator('.task-body').filter({hasText:'熬夜'}).click({button:'right'});await page.getByRole('menuitem',{name:'恢复为普通待办'}).click();
 await page.locator('.rail').getByRole('button',{name:'统计',exact:true}).click();await expect(stats.locator('.points-metrics>div').filter({hasText:'区间净积分'})).toContainText('+10');
});
