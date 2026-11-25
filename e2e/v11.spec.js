import {test,expect} from '@playwright/test';
test('任务聚焦快捷键、标题编辑与安排日期',async({page})=>{
 await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).fill('快捷验收');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 const body=page.locator('.task-body').filter({hasText:'快捷验收'});
 await body.focus();await page.keyboard.press('F2');
 await expect(page.getByRole('textbox',{name:'任务标题'})).toBeFocused();
 await page.keyboard.type('重命名验收');await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('重命名验收');
 await page.locator('.task-body').filter({hasText:'重命名验收'}).focus();await page.keyboard.press('m');
 await expect(page.getByRole('status').filter({hasText:'已安排到明天'})).toBeVisible();
 await page.locator('.nav-row').filter({hasText:'最近七天'}).click();
 await expect(page.locator('.task-body').filter({hasText:'重命名验收'})).toBeVisible();
 await page.locator('.task-body').filter({hasText:'重命名验收'}).focus();await page.keyboard.press('t');
 await expect(page.getByRole('status').filter({hasText:'已安排到今天'})).toBeVisible();
});
test('日历切换月份后联动日期与返回今天',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('button',{name:'日历',exact:true}).click();
 const date=page.getByLabel('联动日期');await date.fill('2026-12-10');
 const next=page.getByRole('button',{name:'下月',exact:true});await next.click();
 await expect(date).toHaveValue(/^2027-01-/);
 await page.getByRole('button',{name:'回到今天',exact:true}).click();
 const today=await page.evaluate(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')});
 await expect(date).toHaveValue(today);expect(errors).toEqual([]);
});
test('时间预算合并重叠且待安排任务可筛选',async({page})=>{
 await page.goto('/');
 for(const title of ['预算甲 今天 09:00','预算乙 今天 09:15','待规划甲']){await page.getByRole('textbox',{name:'新任务名称'}).fill(title);await page.getByRole('button',{name:'添加',exact:true}).click()}
 await page.getByRole('button',{name:'每日规划',exact:true}).click();
 await expect(page.getByLabel('工作时间预算')).toContainText('45 / 540 分钟已占用');
 await page.getByLabel('待安排任务搜索').fill('待规划甲');
 await expect(page.locator('.unscheduled')).toContainText('待规划甲');
 await page.getByLabel('待安排任务搜索').fill('不存在');
 await expect(page.locator('.unscheduled')).toContainText('没有匹配');
 await page.screenshot({path:'test-results/v11-planner.png'});
});
