import {test,expect} from '@playwright/test';
test('面板尺寸键盘、拖动、刷新恢复和减少动效',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).fill('面板测试');await page.getByRole('button',{name:'添加',exact:true}).click();
 const handle=page.getByRole('separator',{name:'调整详情栏宽度'}),detail=page.locator('.details');
 await expect(handle).toBeVisible();expect(await detail.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 const start=Number(await handle.getAttribute('aria-valuenow'));await handle.focus();await page.keyboard.press('ArrowLeft');
 await expect(handle).toHaveAttribute('aria-valuenow',String(start+16));
 const before=await handle.boundingBox();if(!before)throw Error('panel handle not visible');
 await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.mouse.move(before.x+before.width/2-42,before.y+before.height/2,{steps:12});await page.mouse.up();
 await expect(handle).toHaveAttribute('aria-valuenow',String(start+58));
 await expect(page.locator('body')).not.toHaveClass(/resizing-panels/);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-panel-layout-v1')||'{}').detail)).toBe(start+58);
 await page.reload();await page.locator('.task-body').filter({hasText:'面板测试'}).click();await expect(handle).toHaveAttribute('aria-valuenow',String(start+58));
});
test('正常动效下详情面板可反复打开关闭',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).fill('详情过渡');await page.getByRole('button',{name:'添加',exact:true}).click();
 for(let i=0;i<3;i++){await page.getByRole('button',{name:'关闭详情'}).click();await expect(page.locator('.details')).toHaveCount(0);await page.locator('.task-body').filter({hasText:'详情过渡'}).click();await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('详情过渡')}
 await page.screenshot({path:'test-results/v115-detail.png',animations:'disabled'});
});
