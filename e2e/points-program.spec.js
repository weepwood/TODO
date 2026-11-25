import {test,expect} from '@playwright/test';
test('积分目标、累计趋势、兑换余额、退款及持久化',async({page})=>{
 await page.goto('/');
 for(const title of ['阅读 积分+100','熬夜 积分-10']){await page.getByRole('textbox',{name:'新任务名称'}).fill(title);await page.getByRole('button',{name:'添加',exact:true}).click()}
 await page.getByRole('button',{name:'完成 阅读',exact:true}).click();await page.getByRole('button',{name:'完成 熬夜',exact:true}).click();
 await page.locator('.rail').getByRole('button',{name:'统计',exact:true}).click();
 const goals=page.getByLabel('积分目标',{exact:true}),wallet=page.getByLabel('积分兑换',{exact:true});
 await goals.getByRole('button',{name:'设置目标'}).click();
 await page.getByRole('spinbutton',{name:'每日目标'}).fill('100');await page.getByRole('spinbutton',{name:'每周目标'}).fill('80');await page.getByRole('spinbutton',{name:'每月目标'}).fill('200');await page.getByRole('button',{name:'保存目标'}).click();
 await expect(goals.locator('.goal-card').first()).toContainText('还差 10 分');await expect(goals.locator('.goal-card').nth(1)).toContainText('已达成');
 await expect(page.getByRole('img',{name:'累计净积分从 0 到 +90'})).toBeVisible();
 await wallet.getByRole('button',{name:'添加奖励'}).click();await page.getByLabel('奖励名称',{exact:true}).fill('看电影');await page.getByLabel('所需积分',{exact:true}).fill('60');await page.getByRole('button',{name:'保存奖励'}).click();
 await wallet.getByRole('button',{name:'兑换',exact:true}).click();await page.getByRole('button',{name:'确认兑换',exact:true}).click();
 await expect(wallet.locator('.wallet-grid>div').first()).toContainText('+30');await expect(wallet.getByRole('button',{name:'兑换',exact:true})).toBeDisabled();
 await expect(page.getByRole('img',{name:'累计净积分从 0 到 +90'})).toBeVisible();
 await wallet.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/points-program-light.png',animations:'disabled'});
 await wallet.getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('所需积分',{exact:true}).fill('50');await page.getByRole('button',{name:'保存奖励'}).click();
 await wallet.getByRole('button',{name:'退回积分'}).click();await expect(page.getByRole('dialog')).toContainText('60 分');await page.getByRole('button',{name:'确认退回'}).click();
 await expect(wallet.locator('.wallet-grid>div').first()).toContainText('+90');await expect(wallet.getByRole('button',{name:'退回积分'})).toHaveCount(0);
 await page.reload();await page.locator('.rail').getByRole('button',{name:'统计',exact:true}).click();await expect(wallet).toContainText('已退款');await expect(goals.locator('.goal-card').first()).toContainText('还差 10 分');
});
test('积分兑换深色窄屏布局与余额不足',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark'});await page.goto('/');
 await page.locator('.rail').getByRole('button',{name:'统计',exact:true}).click();const wallet=page.getByLabel('积分兑换',{exact:true});
 await wallet.getByRole('button',{name:'添加奖励'}).click();await page.getByLabel('奖励名称',{exact:true}).fill('休息');await page.getByLabel('所需积分',{exact:true}).fill('10');await page.getByRole('button',{name:'保存奖励'}).click();
 await expect(wallet.getByRole('button',{name:'兑换',exact:true})).toBeDisabled();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await wallet.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/points-program-dark-mobile.png',animations:'disabled'});
});
