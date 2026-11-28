import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
for(const [width,height,theme] of [[1440,900,'light'],[390,844,'dark']]){
 test('录入与统计控件视觉及交互 '+width,async({page})=>{
  await page.setViewportSize({width,height});const d=initialState();d.theme=theme;d.tasks=[newTask('控件验收','inbox',dayKey())];
  await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),d);await page.goto('/');
  const bar=page.locator('.task-capture-toolbar'),form=bar.locator('.quick-add'),add=bar.getByRole('button',{name:'添加',exact:true}),sort=bar.getByRole('button',{name:'分组、排序与顺序'});
  await expect(add).toBeDisabled();
  const heights=await bar.evaluate(e=>[...e.children].filter(x=>x.getBoundingClientRect().height).map(x=>x.getBoundingClientRect().height));
  expect(Math.max(...heights)-Math.min(...heights)).toBeLessThanOrEqual(1);
  expect(Math.round(heights[0])).toBe(width>860?36:48);
  const geometry=await bar.evaluate(el=>[...el.children].filter(e=>e.getBoundingClientRect().height).map(e=>({shadow:getComputedStyle(e).boxShadow,image:getComputedStyle(e).backgroundImage,radius:getComputedStyle(e).borderRadius})));
  expect(geometry.every(v=>v.shadow==='none'&&v.image==='none'&&v.radius==='8px')).toBe(true);
  if(width<860)expect((await add.boundingBox()).height).toBeGreaterThanOrEqual(43.95);

  await bar.getByRole('textbox',{name:'新任务名称'}).fill('新建验收任务');await expect(add).toBeEnabled();
  await expect.poll(()=>add.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await sort.click();await expect(page.getByRole('menu').first()).toBeVisible();await page.keyboard.press('Escape');await expect(sort).toBeFocused();
  if(width>860){await bar.getByRole('button',{name:'批量创建'}).click();await expect(page.getByRole('dialog',{name:'批量创建任务'})).toBeVisible();await page.keyboard.press('Escape');}
  await add.click();await expect(page.locator('.task-row').filter({hasText:'新建验收任务'})).toHaveCount(1);
 });
 test('统计筛选与导航 '+width,async({page})=>{
  await page.setViewportSize({width,height});const d=initialState();d.theme=theme;d.tasks=[newTask('控件验收','inbox',dayKey())];
  await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),d);await page.goto('/');
  await page.getByRole('button',{name:'统计',exact:true}).click();const stats=page.locator('.stats-toolbar');
  await expect(stats).toBeVisible();
  const sizes=await stats.locator('button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));expect(Math.max(...sizes)-Math.min(...sizes)).toBeLessThanOrEqual(1);if(width<860)expect(Math.min(...sizes)).toBeGreaterThanOrEqual(44);
  await stats.getByRole('combobox',{name:'统计区间'}).click();await page.getByRole('option',{name:'近 7 天',exact:true}).click();await expect(stats.getByRole('combobox',{name:'统计区间'})).toContainText('近 7 天');
  await stats.getByRole('button',{name:'跳转到…'}).click();await page.getByRole('menuitem',{name:'任务概览'}).click();await expect(page.locator('#task-stats-overview')).toBeFocused();
  await stats.getByRole('button',{name:'任务回顾'}).click();await expect(page.getByRole('dialog',{name:'任务回顾'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}
