import {test,expect,devices} from '@playwright/test';
test('紧凑工具栏、底部录入、选择模式和任务完成反馈',async({browser})=>{
 const ctx=await browser.newContext({...devices['Pixel 7'],baseURL:'http://127.0.0.1:4178'});
 try{
 const page=await ctx.newPage();await page.goto('/');
 await expect(page.locator('.mobile-toolbar-title')).toHaveText('今天');
 await expect(page.getByRole('button',{name:'工作台操作'})).toBeVisible();
 await page.getByRole('button',{name:'新建任务',exact:true}).click();
 const capture=page.getByRole('dialog',{name:'快速新建任务'});
 await expect(capture).toBeVisible();
 await capture.getByRole('textbox',{name:'快速任务名称'}).fill('移动操作验收');
 await capture.getByRole('button',{name:'创建任务',exact:true}).click();
 await page.getByRole('button',{name:'关闭详情'}).click();await expect(page.locator('.details')).toHaveCount(0);
 const row=page.locator('.task-row').filter({hasText:'移动操作验收'});
 await expect(row).toBeVisible();await expect(row.getByRole('button',{name:'选择 移动操作验收'})).toBeHidden();
 await page.getByRole('button',{name:'选择任务',exact:true}).click();
 await row.getByRole('button',{name:'选择 移动操作验收'}).click();
 await expect(page.getByText('已选 1 项',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'结束选择'}).click();
 await row.getByRole('button',{name:'任务操作 移动操作验收'}).click();
 await expect(page.getByRole('menuitem',{name:'安排今天'})).toBeVisible();
 await page.keyboard.press('Escape');
 await row.getByRole('button',{name:'完成 移动操作验收'}).click();
 await expect(page.getByRole('status').filter({hasText:'任务已完成'})).toBeVisible();
 await page.screenshot({path:'test-results/refinement-mobile-tasks.png',animations:'disabled'});
 }finally{await ctx.close()}
});
test('共享日历日期选择器保持双向联动',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'日历',exact:true}).click();
 await page.getByLabel('联动日期',{exact:true}).fill('2026-12-05');
 await page.getByRole('button',{name:'联动日历选择器'}).click();
 await expect(page.locator('.date-popover')).toBeVisible();
 await page.locator('.date-popover').getByRole('button',{name:'明天',exact:true}).click();
 const date=await page.getByLabel('联动日期',{exact:true}).inputValue();
 await page.getByRole('button',{name:'查看每日规划'}).click();
 await expect(page.getByLabel('规划日期',{exact:true})).toHaveValue(date);
 await page.screenshot({path:'test-results/refinement-planner.png',animations:'disabled'});
});
test('移动设置分类精确定位并保持选中状态',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'更多',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'设置',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'设置与数据管理'});
 const nav=dialog.getByRole('navigation',{name:'设置分类'});
 await nav.getByRole('button',{name:'外观与布局'}).click();
 await expect(nav.getByRole('button',{name:'外观与布局'})).toHaveAttribute('aria-current','location');
 const rect=await dialog.locator('#settings-appearance').boundingBox(),bar=await nav.boundingBox();
 expect(rect.y).toBeGreaterThanOrEqual(bar.y+bar.height-2);
 expect(rect.y).toBeLessThan(bar.y+bar.height+35);
 await page.screenshot({path:'test-results/refinement-mobile-settings.png',animations:'disabled'});
});
test('统计概览优先，积分跳转与双主题布局',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'统计',exact:true}).click();
 await expect(page.getByRole('heading',{name:'任务概览'})).toBeVisible();
 const a=await page.getByRole('heading',{name:'任务概览'}).boundingBox(),b=await page.getByRole('heading',{name:'任务积分',exact:true}).boundingBox();expect(a.y).toBeLessThan(b.y);
 await page.locator('.stats-jump').getByRole('button',{name:'任务积分'}).click();
 await expect(page.getByRole('heading',{name:'任务积分',exact:true})).toBeInViewport();
 await page.screenshot({path:'test-results/refinement-points.png',animations:'disabled'});
});
