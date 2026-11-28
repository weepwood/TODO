import {test,expect} from '@playwright/test';
import {initialState} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
const dir='test-results/activitywatch';
for(const [width,design,theme] of [[1440,'classic','light'],[1440,'native','dark'],[390,'native','light']]){
 test('活动分析无自动连接、合成报告与日期重置 '+width+' '+design,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.route('**/*',route=>{const u=new URL(route.request().url());return u.origin==='http://127.0.0.1:4178'?route.continue():route.abort()});
  await page.addInitScript(({d,design,theme})=>{d.theme=theme;localStorage.setItem('todo-workbench-v1',JSON.stringify(d));localStorage.setItem('todo-appearance-v1',JSON.stringify({designTheme:design,accent:'blue'}))},{d:initialState(),design,theme});
  await page.goto('/');
  if(width<861){await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name:'活动分析',exact:true}).click();}
  else {await page.getByRole('button',{name:'打开活动分析',exact:true}).click();}
  const view=page.locator('.aw-view');
  await expect(view).toBeVisible();await expect(view.getByText('尚未连接',{exact:true})).toBeVisible();
  await expect(view.getByRole('button',{name:'检测本地连接'})).toBeDisabled();
  await expect(view.getByRole('button',{name:'授权读取所选日期'})).toBeDisabled();
  await expect(view.getByRole('heading',{name:'软件排行'})).toHaveCount(0);
  await view.getByLabel('活动日期').fill('2026-11-27');
  await view.getByRole('button',{name:'查看合成示例'}).click();
  await expect(view.getByText('合成演示 · 非真实活动')).toBeVisible();
  await expect(view.getByRole('heading',{name:'软件排行'})).toBeVisible();
  await expect(view.getByText('github.com',{exact:true})).toBeVisible();
  await expect(view.getByText('工程开发（示例）',{exact:true})).toBeVisible();
  await expect(view.getByText('5 小时 30 分钟',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  mkdirSync(dir,{recursive:true});await page.screenshot({path:dir+'/'+width+'-'+design+'-'+theme+'.png',animations:'disabled'});
  await view.getByLabel('活动日期').fill('2026-11-26');await expect(view.getByRole('heading',{name:'软件排行'})).toHaveCount(0);
  expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes('activitywatch')))).toBe(false);
 });
}

for(const width of [1440,390]){
 test('周期趋势、筛选、颜色和日期导航 '+width,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:4178'?r.continue():r.abort());
  await page.addInitScript(d=>{localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},initialState());
  await page.goto('/');
  if(width<861){await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name:'活动分析',exact:true}).click();}
  else{await page.getByRole('button',{name:'打开活动分析',exact:true}).click();}
  const view=page.locator('.aw-view'),period=view.getByRole('group',{name:'活动统计周期'});
  await view.getByLabel('活动日期').fill('2024-02-15');
  await period.getByRole('button',{name:'周',exact:true}).click();
  await expect(view.getByTestId('aw-range')).toContainText('2024-02-12 至 2024-02-18');
  await view.getByRole('button',{name:'查看合成示例'}).click();
  await expect(view.locator('.aw-trend-bar')).toHaveCount(7);
  await expect(view.locator('.aw-trend-bar[data-available=false]')).toHaveCount(1);
  await view.getByRole('group',{name:'活动类型'}).getByRole('button',{name:'网站',exact:true}).click();
  await view.getByLabel('活动主体筛选').selectOption('github.com');
  await expect(view.getByRole('button',{name:/2024-02-12 1 小时 0 分钟/})).toBeVisible();
  await view.getByRole('button',{name:'清除筛选'}).click();
  await expect(view.getByLabel('活动主体筛选')).toHaveValue('');
  await view.getByRole('button',{name:'上一周期'}).click();
  await expect(view.getByLabel('活动日期')).toHaveValue('2024-02-05');
  await expect(view.locator('.aw-trend-bar')).toHaveCount(0);
  await view.getByRole('button',{name:'下一周期'}).click();
  await view.getByLabel('活动日期').fill('2024-02-15');
  await period.getByRole('button',{name:'月',exact:true}).click();
  await view.getByRole('button',{name:'查看合成示例'}).click();
  await expect(view.locator('.aw-trend-bar')).toHaveCount(29);
  mkdirSync(dir,{recursive:true});await page.screenshot({path:dir+'/period-month-'+width+'.png',animations:'disabled'});
  await period.getByRole('button',{name:'年',exact:true}).click();
  await view.getByRole('button',{name:'查看合成示例'}).click();
  await expect(view.locator('.aw-trend-bar')).toHaveCount(12);
  await page.screenshot({path:dir+'/period-year-'+width+'.png',animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await period.getByRole('button',{name:'日',exact:true}).click();
  await view.getByRole('button',{name:'查看合成示例'}).click();
  await view.getByRole('group',{name:'活动类型'}).getByRole('button',{name:'软件',exact:true}).click();
  expect(await view.locator('.aw-timeline span').evaluateAll(nodes=>new Set(nodes.map(n=>n.style.background)).size)).toBeGreaterThan(1);
  await view.getByRole('group',{name:'活动类型'}).getByRole('button',{name:'网站',exact:true}).click();
  await view.getByLabel('活动主体筛选').selectOption('github.com');
  await expect(view.locator('.aw-timeline span')).toHaveCount(1);
  await expect(view.locator('.aw-events')).toContainText('github.com');
  await expect(view.locator('.aw-events')).not.toContainText('developer.mozilla.org');
  await page.screenshot({path:dir+'/period-filter-'+width+'.png',animations:'disabled'});
  expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes('activitywatch')))).toBe(false);
 });
}
