import {test,expect} from '@playwright/test';
async function add(page,name){
 await page.getByRole('textbox',{name:'新任务名称'}).fill(name);
 await page.getByRole('button',{name:'添加',exact:true}).click();
 await page.getByRole('button',{name:'关闭详情'}).click();
 await expect(page.locator('.details')).toHaveCount(0);
}
test('手机端单一可见标题、空清单及统一日期编辑',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.locator('.mobile-toolbar-title')).toHaveText('今天');
 await expect(page.getByRole('heading',{name:'今天',exact:true})).toHaveCount(1);
 expect(await page.locator('.workspace-title h1').evaluate(el=>el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
 await expect(page.locator('.list-caption')).toHaveCount(0);
 await add(page,'手机任务');
 await page.screenshot({path:'test-results/polish-mobile-tasks.png',animations:'disabled'});
 await page.getByRole('button',{name:'日历',exact:true}).click();
 const date=page.getByLabel('联动日期',{exact:true});await date.fill('2026-12-10');
 await expect(date).toHaveValue('2026-12-10');
 await date.fill('2026-02-30');await expect(date).toHaveAttribute('aria-invalid','true');
 await date.press('Escape');await expect(date).toHaveValue('2026-12-10');
 await page.getByRole('button',{name:'联动日历选择器'}).click();
 await expect(page.locator('.date-popover')).toBeVisible();
 await page.locator('.date-popover').getByRole('button',{name:'明天',exact:true}).click();
 const next=await date.inputValue();
 await page.getByRole('button',{name:'查看每日规划'}).click();
 await expect(page.getByLabel('规划日期',{exact:true})).toHaveValue(next);
 await page.screenshot({path:'test-results/polish-mobile-planner.png',animations:'disabled'});
});
test('空统计收敛，真实计分任务完成后恢复趋势',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'统计',exact:true}).click();
 await expect(page.locator('.task-completion-chart .chart-empty')).toBeVisible();
 await expect(page.locator('.points-chart-grid .chart-empty')).toHaveCount(2);
 await page.screenshot({path:'test-results/polish-empty-stats.png',animations:'disabled'});
 await page.getByRole('button',{name:'任务',exact:true}).click();
 await add(page,'完成计分任务');
 await page.locator('.task-body').filter({hasText:'完成计分任务'}).click();
 await page.getByRole('spinbutton',{name:'任务积分'}).fill('12');
 await page.getByRole('spinbutton',{name:'任务积分'}).press('Tab');
 await page.getByRole('button',{name:'关闭详情'}).click();
 await expect(page.locator('.details')).toHaveCount(0);
 await page.getByRole('button',{name:'完成 完成计分任务'}).click();
 await page.getByRole('button',{name:'统计',exact:true}).click();
 await expect(page.locator('.task-completion-chart .bars')).toBeVisible();
 await expect(page.getByRole('img',{name:'累计净积分从 0 到 +12'})).toBeVisible();
 await page.screenshot({path:'test-results/polish-populated-stats.png',animations:'disabled'});
});
test('任务完成时剩余行重排且减少动效模式不启动动画',async({page})=>{
 await page.addInitScript(()=>{
  const original=Element.prototype.animate;
  window.__rowMotions=0;
  Element.prototype.animate=function(...args){if(this.matches('.task-row')&&args[0]?.[0]?.translate)window.__rowMotions++;return original.apply(this,args)};
 });
 await page.goto('/');await add(page,'第一项');await add(page,'第二项');await add(page,'第三项');
 await page.getByRole('button',{name:'完成 第一项'}).click();
 await expect(page.locator('.task-body').filter({hasText:'第一项'})).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>window.__rowMotions)).toBeGreaterThan(0);
 await page.emulateMedia({reducedMotion:'reduce'});
 const count=await page.evaluate(()=>window.__rowMotions);
 await page.getByRole('button',{name:'完成 第二项'}).click();
 await expect(page.locator('.task-body').filter({hasText:'第二项'})).toHaveCount(0);
 expect(await page.evaluate(()=>window.__rowMotions)).toBe(count);
});
