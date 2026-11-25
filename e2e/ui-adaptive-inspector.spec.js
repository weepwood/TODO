import {test,expect} from '@playwright/test';

test('宽屏空详情默认打开，模块仅背景选中，手动关闭和重新打开',async({page})=>{
 await page.setViewportSize({width:1600,height:960});await page.goto('/');
 const toggle=page.getByRole('button',{name:'切换详情面板'}),aside=page.locator('aside.details');
 const rail=page.locator('.rail').getByRole('button',{name:'任务',exact:true});
 await expect(rail).toHaveAttribute('aria-pressed','true');
 expect(await rail.evaluate(el=>getComputedStyle(el,'::before').content)).toBe('none');
 expect(await rail.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect(aside.getByText('未选择任务',{exact:true})).toBeVisible();
 await expect(aside.locator('svg.detail-empty-art')).toBeVisible();
 await page.screenshot({path:'test-results/inspector-empty-wide.png',animations:'disabled'});
 const w=(await page.locator('.workspace').boundingBox()).width;
 await toggle.click();await expect(aside).toHaveCount(0);await expect(toggle).toHaveAttribute('aria-expanded','false');
 await expect.poll(async()=>(await page.locator('.workspace').boundingBox()).width).toBeGreaterThan(w+250);
 await page.locator('[data-view-key=inbox]').click();await expect(aside).toHaveCount(0);
 await toggle.click();await expect(aside.getByText('未选择任务')).toBeVisible();
 await page.getByRole('textbox',{name:'新任务名称'}).fill('详情切换验收');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 await expect(aside.getByRole('textbox',{name:'任务标题'})).toHaveValue('详情切换验收');
 await expect(aside.locator('.detail-empty')).toHaveCount(0);
 await page.locator('[data-view-key=today]').click();await expect(aside.locator('.detail-empty')).toBeVisible();
 await page.locator('.rail').getByRole('button',{name:'统计',exact:true}).click();
 await expect(aside).toHaveCount(0);
 await toggle.click();await expect(aside.locator('.detail-empty')).toBeVisible();
});
test('自动宽度响应、窄屏手动展开、手机空详情与返回',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.goto('/');
 const aside=page.locator('aside.details'),toggle=page.getByRole('button',{name:'切换详情面板'});
 await expect(aside).toHaveCount(0);
 await page.setViewportSize({width:1600,height:900});await expect(aside.locator('.detail-empty')).toBeVisible();
 await page.setViewportSize({width:1280,height:900});await expect(aside).toHaveCount(0);
 await toggle.click();await expect(aside.locator('.detail-empty')).toBeVisible();
 await page.setViewportSize({width:390,height:844});await expect(aside).toHaveCount(0);
 await page.getByRole('button',{name:'工作台操作'}).click();
 await page.getByRole('menuitem',{name:'显示详情',exact:true}).click();
 await expect(aside.locator('.detail-empty')).toBeVisible();
 await page.screenshot({path:'test-results/inspector-empty-mobile.png',animations:'disabled'});
 await aside.getByRole('button',{name:'关闭详情'}).click();await expect(aside).toHaveCount(0);
});
test('深色主题空详情使用主题语义颜色，无水平溢出',async({page})=>{
 await page.setViewportSize({width:1600,height:900});
 await page.addInitScript(()=>{const raw=localStorage.getItem('todo-workbench-v1');if(raw){const s=JSON.parse(raw);s.theme='dark';localStorage.setItem('todo-workbench-v1',JSON.stringify(s))}});
 await page.emulateMedia({colorScheme:'dark'});await page.goto('/');
 await expect(page.locator('aside.details .detail-empty-art')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/inspector-empty-dark.png',animations:'disabled'});
});
