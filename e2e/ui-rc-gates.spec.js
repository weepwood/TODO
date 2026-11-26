import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync} from 'node:fs';

for(const [width,theme] of [[1440,'light'],[390,'dark']])test('候选版周期控件布局 '+width+' '+theme,async({page,browserName})=>{
 const data=initialState();data.theme=theme;data.tasks=[newTask('隔离验收任务','inbox',dayKey(),'qa')];
 await page.setViewportSize({width,height:900});
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},data);
 await page.goto('/');await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 const open=async(label)=>{
  if(width<=860){await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name:label,exact:true}).click()}
  else await page.getByRole('button',{name:'打开'+label,exact:true}).first().click()
 };
 await open('自动化工作台');const snapshot=page.locator('.workflow-snapshot-settings');
 await expect(snapshot).toBeVisible();
 const label=snapshot.getByText('频率',{exact:true});
 expect(await label.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getClientRects().length})).toBe(1);
 const frequency=snapshot.getByRole('combobox',{name:'自动回顾周期'});await frequency.click();await page.getByRole('option',{name:'每日',exact:true}).click();
 await expect(snapshot.getByRole('button',{name:'自动回顾保存时间选择器'})).toBeVisible();
 await snapshot.scrollIntoViewIfNeeded();
 mkdirSync('test-results/rc-gates',{recursive:true});await page.screenshot({path:'test-results/rc-gates/'+browserName+'-workflow-'+width+'.png',animations:'disabled'});
 await page.getByRole('button',{name:'保存规则',exact:true}).click();await expect(page.getByText('规则已保存',{exact:true})).toBeVisible();
 await open('目标管理');const toolbar=page.locator('.period-goal-toolbar');await expect(toolbar).toBeVisible();
 const month=toolbar.getByRole('button',{name:'月度',exact:true}),year=toolbar.getByRole('button',{name:'年度',exact:true});await expect(month).toHaveAttribute('aria-pressed','true');
 const a=await month.boundingBox(),b=await year.boundingBox();expect(b.x-a.x-a.width).toBeLessThanOrEqual(12);expect(Math.abs(b.y-a.y)).toBeLessThanOrEqual(2);
 if(width<=860)expect(a.height).toBeGreaterThanOrEqual(44);
 await year.click();await expect(year).toHaveAttribute('aria-pressed','true');await expect(month).toHaveAttribute('aria-pressed','false');
 await expect(toolbar.locator(':scope > span')).toHaveText(dayKey().slice(0,4));await toolbar.scrollIntoViewIfNeeded();
 await page.screenshot({path:'test-results/rc-gates/'+browserName+'-goals-'+width+'.png',animations:'disabled'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks.map(t=>t.id))).toEqual(['qa']);
});
