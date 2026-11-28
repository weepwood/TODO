import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const dir='test-results/settings-layout';
// Layout assertions isolate geometry from the opening transform animation.
test.use({reducedMotion:'reduce'});
for(const width of [1440,390,320])test('设置独立滚动、统一控件及主题 '+width,async({page})=>{
 await page.setViewportSize({width,height:width>860?900:844});await page.goto('/');
 if(width<=860){await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'设置',exact:true}).click()}else await page.getByRole('button',{name:'设置',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'设置与数据管理'}),nav=dialog.getByRole('navigation',{name:'设置分类'}),pane=dialog.getByRole('region',{name:'设置内容'});
 await expect(pane).toBeVisible();const header=dialog.locator('.dialog-head'),initialHeader=await header.boundingBox(),initialNav=await nav.boundingBox();
 mkdirSync(dir,{recursive:true});
 for(const [name,id] of [['外观与布局','appearance'],['任务与清单','tasks'],['专注','focus'],['本地数据','data'],['提醒','notifications']]){
  await nav.getByRole('button',{name,exact:true}).click();
  await expect(nav.getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','location');
  const section=dialog.locator('#settings-'+id),p=await pane.boundingBox(),r=await section.boundingBox();
  await expect(pane.locator('.settings-section:visible')).toHaveCount(1);
  await expect(nav.getByRole('button',{name,exact:true})).toHaveAttribute('aria-controls','settings-'+id);
  expect(await pane.evaluate(el=>el.scrollTop)).toBe(0);
  await pane.evaluate(el=>el.scrollTop=el.scrollHeight);
  await expect(nav.getByRole('button',{name,exact:true})).toHaveAttribute('aria-current','location');
  await expect(pane.locator('.settings-section:visible')).toHaveCount(1);
  await pane.evaluate(el=>el.scrollTop=0);
  expect(r.y).toBeGreaterThanOrEqual(p.y-1);expect(r.y).toBeLessThan(p.y+24);
  expect(Math.abs((await header.boundingBox()).y-initialHeader.y)).toBeLessThan(1);
  expect(Math.abs((await nav.boundingBox()).y-initialNav.y)).toBeLessThan(1);
  expect(await pane.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await dialog.evaluate(el=>el.scrollTop)).toBe(0);
  if(id==='appearance'){
   await dialog.getByRole('button',{name:'深色',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
   await page.screenshot({path:dir+'/'+width+'-appearance-dark.png',animations:'disabled'});
   await dialog.getByRole('button',{name:'浅色',exact:true}).click();
  }
  if(id!=='notifications')await page.screenshot({path:dir+'/'+width+'-'+id+'.png',animations:'disabled'});
 }
 await nav.getByRole('button',{name:'任务与清单',exact:true}).click();
 const boxes=await dialog.locator('.list-defaults .field > :last-child').evaluateAll(els=>els.map(el=>({x:el.getBoundingClientRect().x,w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})));
 expect(boxes.length).toBeGreaterThan(5);
 for(const b of boxes){expect(Math.abs(b.x-boxes[0].x)).toBeLessThan(2);expect(Math.abs(b.w-boxes[0].w)).toBeLessThan(2);expect(b.h).toBeGreaterThanOrEqual(width<=860?44:36)}
});
test('规划与日历工具栏公共控件对齐',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/');
 for(const [name,toolbar] of [['每日规划','.planner-toolbar'],['日历','.calendar-info']]){
  await page.getByRole('button',{name,exact:true}).click();
  const bar=page.locator(toolbar);await expect(bar).toBeVisible();
  const rows=await bar.locator('button.secondary,button.primary,.smart-select-trigger,.date-control').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>({h:e.getBoundingClientRect().height,cls:e.className})));
  expect(rows.length).toBeGreaterThan(2);
  for(const r of rows)expect(Math.abs(r.h-36),r.cls).toBeLessThan(1);
  expect(await bar.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await page.screenshot({path:dir+'/'+name+'-toolbar.png',animations:'disabled'});
 }
});

test('设置分类隔离且切换保留未提交表单草稿',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/');
 await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'设置与数据管理'}),nav=dialog.getByRole('navigation',{name:'设置分类'});
 const email=dialog.locator('#settings-account input[type=email]');
 await email.fill('draft@example.invalid');
 await nav.getByRole('button',{name:'专注',exact:true}).click();
 await expect(email).toBeHidden();
 await expect(dialog.getByRole('textbox',{name:'邮箱'})).toHaveCount(0);
 await expect(dialog.locator('#settings-focus')).toBeVisible();
 await nav.getByRole('button',{name:'账号与同步',exact:true}).click();
 await expect(email).toHaveValue('draft@example.invalid');
 await expect(dialog.locator('#settings-focus')).toBeHidden();
});
