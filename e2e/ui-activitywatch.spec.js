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
