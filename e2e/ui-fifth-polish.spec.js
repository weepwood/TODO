import {test,expect,devices} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
const dir='test-results/fifth-polish';
async function seed(page,theme='dark'){
 const d=initialState();d.theme=theme;d.tasks=[newTask('布局与动效验收','inbox',dayKey()),newTask('第二个任务','inbox',dayKey())];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);await page.goto('/');mkdirSync(dir,{recursive:true});
}
for(const width of [861,1024,1150,1151])test('中间宽度工作区与双面板 '+width,async({page})=>{
 await page.setViewportSize({width,height:768});await page.emulateMedia({reducedMotion:'reduce'});await seed(page);await page.locator('.task-body').filter({hasText:'布局与动效验收'}).click();
 const workspace=page.locator('.workspace'),detail=page.getByRole('complementary',{name:'任务详情'});await expect(detail).toBeVisible();await expect(detail.locator("[data-detail-section=plan]")).toBeVisible();
 expect((await workspace.boundingBox()).width).toBeGreaterThanOrEqual(320);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(await detail.locator("[data-detail-section=plan]").evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:dir+'/'+width+'-detail.png',animations:'disabled'});
 await page.getByRole('button',{name:'隐藏清单栏'}).click();await expect(page.locator('.app')).toHaveAttribute('data-sidebar-hidden','true');
 expect((await workspace.boundingBox()).width).toBeGreaterThan(500);
 await page.getByRole('button',{name:'显示清单栏'}).click();
 await expect(page.getByRole('button',{name:'隐藏清单栏'})).toBeVisible();
});
test('移动开关触控尺寸与低高度设置',async({page})=>{
 await page.setViewportSize({width:812,height:375});await seed(page,'light');await page.getByRole('navigation',{name:'移动端主导航'}).getByRole('button',{name:'更多'}).click();await page.getByRole('dialog').getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'外观与布局'}).click();const toggle=page.getByRole('switch',{name:'增强焦点描边'});await expect(toggle).toBeVisible();const b=await toggle.boundingBox();expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','true');await page.screenshot({path:dir+'/landscape-settings.png',animations:'disabled'});
});
test('短滑回弹重抓不跳回原点也不误开菜单',async({browser,browserName})=>{
 test.skip(browserName!=='chromium','CDP touch stream');
 const ctx=await browser.newContext({...devices['Pixel 7'],baseURL:'http://127.0.0.1:4178'});
 try{const page=await ctx.newPage();await seed(page,'light');const row=page.locator('.task-body').filter({hasText:'布局与动效验收'});await expect(row).toBeVisible();await page.addStyleTag({content:'.v2.compact-mobile .task-row:not([data-gesture=dragging]) .task-body{transition-duration:900ms!important}'});const cdp=await ctx.newCDPSession(page);
 const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
 let b=await row.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;await touch('touchStart',x,y);await touch('touchMove',x-45,y);await expect.poll(()=>row.evaluate(e=>parseFloat(getComputedStyle(e).translate))).toBe(-45);await touch('touchEnd',0,0);
 // Re-grab during the actual CSS return. Snapshot just before and after.
 b=await row.boundingBox();x=b.x+b.width/2;y=b.y+b.height/2;const before=await row.evaluate(e=>parseFloat(getComputedStyle(e).translate)||0);
 expect(before).toBeLessThan(-10);await touch('touchStart',x,y);const grabbed=await row.evaluate(e=>parseFloat(getComputedStyle(e).translate)||0);expect(Math.abs(grabbed-before)).toBeLessThan(12);await touch('touchMove',x-15,y);await touch('touchEnd',0,0);await expect.poll(()=>row.evaluate(e=>parseFloat(getComputedStyle(e).translate)||0)).toBe(0);await expect(page.getByRole('menu')).toHaveCount(0);
 }finally{await ctx.close()}
});
