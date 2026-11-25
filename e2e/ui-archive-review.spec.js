import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
import {chooseOption} from './select-helper.js';
import fs from 'node:fs/promises';
async function seed(page){
 const today=dayKey(),d=initialState(),a=newTask('归档待办','work',today);
 d.tags=[{id:'tag-a',name:'学习',color:'#6784da'}];
 d.tasks=[a,{...newTask('历史学习','work',today),tags:['tag-a'],status:'completed',stage:'done',completedAt:today+'T12:00:00'},{...newTask('其他历史','personal',today),status:'completed',stage:'done',completedAt:today+'T12:00:00'}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');return {today,a};
}
test('本机清单归档恢复、任务仍参与今天及刷新持久化',async({page})=>{
 await seed(page);const work=page.locator('[data-view-key=work]');
 await work.hover();await work.locator('..').getByRole('button',{name:'更多操作'}).click();
 await page.getByRole('menuitem',{name:'本机归档清单'}).click();
 await expect(page.getByRole('button',{name:'本机归档',exact:true})).toBeVisible();
 await expect(work).toHaveCount(1);
 await page.reload();await expect(page.getByRole('button',{name:'本机归档',exact:true})).toBeVisible();
 await page.locator('[data-view-key=today]').click();await expect(page.locator('.task-body').filter({hasText:'归档待办'})).toBeVisible();
 await work.hover();await work.locator('..').getByRole('button',{name:'更多操作'}).click();
 await page.getByRole('menuitem',{name:'恢复清单导航'}).click();
 await expect(page.getByRole('button',{name:'本机归档',exact:true})).toHaveCount(0);await expect(work).toHaveCount(1);
});
test('默认提醒与历史组合筛选',async({page})=>{
 const {today}=await seed(page);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'任务与清单'}).click();
 await chooseOption(page.getByRole('combobox',{name:'配置清单'}),'work');
 await chooseOption(page.getByRole('combobox',{name:'默认计划日期'}),'tomorrow');
 await page.getByRole('textbox',{name:'默认提醒时间',exact:true}).fill('09:30');
 await page.keyboard.press('Escape');
 await page.locator('[data-view-key=work]').click();await page.getByRole('textbox',{name:'新任务名称'}).fill('默认提醒验收');
 await expect(page.locator('.capture-preview')).toContainText('提醒 '+shiftDay(today,1)+' 09:30');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks.find(t=>t.title==='默认提醒验收')?.reminderAt)).toBe(shiftDay(today,1)+'T09:30');
 await page.locator('[data-view-key=completed]').click();
 await chooseOption(page.getByRole('combobox',{name:'历史标签'}),'tag-a');
 await chooseOption(page.getByRole('combobox',{name:'历史清单'}),'work');
 await chooseOption(page.getByRole('combobox',{name:'完成时间范围'}),'custom');
 await expect(page.locator('.task-body').filter({hasText:'历史学习'})).toBeVisible();
 await expect(page.locator('.task-body').filter({hasText:'其他历史'})).toHaveCount(0);
 await page.screenshot({path:'test-results/history-custom-filter.png',animations:'disabled'});
});
test('回顾快照保存、刷新、只读与实际导出',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'统计',exact:true}).click();
 await page.getByRole('button',{name:'任务回顾',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'任务回顾'});
 await dialog.getByRole('button',{name:'保存快照',exact:true}).click();
 await expect(dialog.locator('pre')).toContainText('归档待办');await expect(dialog.getByRole('button',{name:'安排明天'})).toHaveCount(0);
 const original=await dialog.locator('pre').innerText();
 await page.keyboard.press('Escape');await page.reload();
 await page.getByRole('button',{name:'统计',exact:true}).click();await page.getByRole('button',{name:'任务回顾',exact:true}).click();
 const selector=dialog.getByRole('combobox',{name:'回顾记录'});await selector.click();await page.getByRole('listbox').getByRole('option').last().click();
 await expect(dialog.locator('pre')).toHaveText(original);
 await page.screenshot({path:'test-results/review-snapshot.png',animations:'disabled'});
 const waiting=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出 Markdown'}).click();const file=await waiting;
 expect(await fs.readFile(await file.path(),'utf8')).toBe(original);
 page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'删除快照',exact:true}).click();await expect(dialog.locator('pre')).toHaveCount(0);
});
