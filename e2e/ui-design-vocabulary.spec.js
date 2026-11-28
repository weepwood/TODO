import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
for(const [width,height,theme] of [[1440,900,'light'],[390,844,'dark']]){
 test(`设计词汇：${width}px ${theme} 下的今日摘要和详情`,async({page})=>{
  await page.setViewportSize({width,height});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});
  const state=initialState(),today=dayKey();state.tasks=['审查视觉层级','整理设计规范与实现'].map(title=>newTask(title,'inbox',today));
  await page.addInitScript(state=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(state))},state);
  await page.goto('/');const section=page.getByRole('region',{name:'今日执行'});
  await expect(section).toBeVisible();await expect(section).toContainText('今日执行 · 2 项');
  const meta=section.locator('.today-execution-meta>span');await expect(meta).toHaveCount(2);
  expect(await meta.first().evaluate(el=>getComputedStyle(el).flexGrow)).toBe('0');
  const expand=section.getByRole('button',{name:'展开执行清单'});await expand.click();await expect(section.getByRole('button',{name:'收起执行清单'})).toHaveAttribute('aria-expanded','true');
  await section.getByRole('button',{name:'收起执行清单'}).click();
  await page.locator('.task-body').first().click();const detail=page.locator('.detail-content');await expect(detail).toBeVisible();
  const label=detail.locator('.property-label').first();expect(await label.evaluate(el=>getComputedStyle(el).paddingInlineStart)).toBe('4px');
  expect(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}

test('桌面详情宽度关闭时同步变化，快速重开保留同一面板',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
 const state=initialState();state.tasks=[newTask('空间连续性验收','inbox',dayKey())];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);
 await page.goto('/');await page.locator('.task-body').first().click();
 const detail=page.locator('.details'),toggle=page.getByRole('button',{name:'切换详情面板'});
 await expect(detail.locator('.detail-content')).toBeVisible();
 await expect.poll(async()=>Math.round((await detail.boundingBox()).width)).toBe(350);
 const initial=await detail.boundingBox();await detail.evaluate(e=>e.dataset.testIdentity='continuous');
 // Dispatch the second action during a measured intermediate animation frame,
 // rather than waiting for the moving toolbar button's actionability stability.
 const intermediate=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const panel=document.querySelector('.details'),button=document.querySelector('.detail-toggle'),width=panel.getBoundingClientRect().width,deadline=performance.now()+500;
  button.click();const sample=()=>{const next=panel.getBoundingClientRect().width;
   if(panel.isConnected&&next<width-4&&next>4){button.click();resolve(next);return}
   if(performance.now()>deadline){reject(Error('No intermediate panel width'));return}requestAnimationFrame(sample)
  };requestAnimationFrame(sample)
 }));
 expect(intermediate).toBeLessThan(initial.width-4);await expect(detail).toHaveAttribute('data-test-identity','continuous');
 await expect.poll(async()=>Math.round((await detail.boundingBox()).width)).toBe(350);
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 await toggle.click();await expect(detail).toHaveCount(0);await expect(toggle).toHaveAttribute('aria-expanded','false');
});

test('移动详情共享指示器连续重定向及减少动效',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'no-preference'});
 const state=initialState();state.tasks=[newTask('分区连续切换验收','inbox',dayKey())];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);
 await page.goto('/');await page.locator('.task-body').first().click();
 const nav=page.getByRole('navigation',{name:'任务详情分区'}),mark=nav.locator('.detail-navigation-indicator');
 await expect(mark).toBeVisible();await mark.evaluate(e=>e.dataset.testIdentity='shared');
 const error=()=>nav.evaluate(n=>{const a=n.querySelector('[aria-current="location"]'),b=n.querySelector('.detail-navigation-indicator');return Math.abs(a.offsetLeft-new DOMMatrix(getComputedStyle(b).transform).m41)+Math.abs(a.offsetWidth-b.offsetWidth)});
 for(const name of ['属性','备注','计划','属性'])await nav.getByRole('button',{name,exact:true}).click();
 await expect(mark).toHaveAttribute('data-test-identity','shared');await expect.poll(error).toBeLessThan(1);
 await page.emulateMedia({reducedMotion:'reduce'});await nav.getByRole('button',{name:'备注',exact:true}).click();
 await expect.poll(error).toBeLessThan(1);await expect(nav.locator('[aria-current=location]')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
