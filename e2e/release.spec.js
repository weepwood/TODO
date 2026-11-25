import {test,expect,devices} from '@playwright/test';
test('发布视觉基线：浅色、深色与详情布局',async({page})=>{
 await page.goto('/');
 for(const name of ['项目验收 今天 09:00 !3','整理资料 今天 11:00','阅读计划 今天 15:00']){await page.getByRole('textbox',{name:'新任务名称'}).fill(name);await page.getByRole('button',{name:'添加',exact:true}).click()}
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'浅色',exact:true}).click();await page.keyboard.press('Escape');
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.screenshot({path:'test-results/release-light.png',animations:'disabled'});
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'深色',exact:true}).click();await page.keyboard.press('Escape');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.screenshot({path:'test-results/release-dark.png',animations:'disabled'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});
test('移动触摸模拟：指针拖动时间块与窄屏导航',async({browser})=>{
 const context=await browser.newContext({...devices['Pixel 7'],baseURL:'http://127.0.0.1:4178'});try{
 const page=await context.newPage();await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).fill('触摸任务 今天 09:00');await page.getByRole('button',{name:'添加',exact:true}).tap();
 await page.getByRole('button',{name:'关闭详情'}).tap();await page.getByRole('button',{name:'每日规划',exact:true}).tap();
 const handle=page.getByRole('button',{name:'移动时间 触摸任务'}),block=page.locator('button.time-block').filter({hasText:'触摸任务'});await handle.scrollIntoViewIfNeeded();const b=await handle.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
 const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=4;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*7}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(block).toHaveAttribute('aria-label',/09:30–10:00/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth));await page.screenshot({path:'test-results/release-touch.png',animations:'disabled'});
 }finally{await context.close()}
});
