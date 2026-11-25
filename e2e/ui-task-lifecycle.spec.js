import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
async function seed(page){
 const today=dayKey(),state=initialState(),a={...newTask('普通积压','inbox',shiftDay(today,-1)),points:5},b={...newTask('每日重复','inbox',today),repeat:'daily'},c={...newTask('长期未安排','inbox'),createdAt:shiftDay(today,-10)+'T12:00:00'};
 state.tasks=[a,b,c];await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);await page.goto('/');return {today,a,b,c};
}
test('系列预计日期、完成生成与历史跳转',async({page})=>{
 await page.setViewportSize({width:1440,height:900});const {today}=await seed(page);
 await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'每日重复'}).click();
 await page.getByRole('button',{name:'查看重复系列'}).click();
 const dialog=page.getByRole('dialog',{name:'重复任务系列'});
 await expect(dialog).toContainText(shiftDay(today,1)+' · 第 2 次');
 await page.screenshot({path:'test-results/series-overview.png',animations:'disabled'});
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'完成 每日重复',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks.filter(t=>t.title==='每日重复').length)).toBe(2);
 await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'每日重复'}).first().click();
 await page.getByRole('button',{name:'查看重复系列'}).click();await dialog.getByRole('button',{name:/第 1 次 · 已完成/}).click();
 await expect(dialog).toHaveCount(0);await expect(page.locator('[data-view-key=completed]')).toHaveAttribute('aria-current','page');
});
test('建议主动安排与每日收尾选中普通任务，保留重复系列',async({page})=>{
 await page.setViewportSize({width:1440,height:900});const {today,a,b,c}=await seed(page);
 await page.locator('[data-view-key=today]').click();await page.getByRole('button',{name:'任务建议',exact:true}).click();
 const suggestions=page.getByRole('dialog',{name:'任务建议'});
 await expect(suggestions).toContainText('长期未安排（至少7天） · 1');
 await suggestions.locator('.review-task-row').filter({hasText:'长期未安排'}).getByRole('button',{name:'安排今天'}).click();
 await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks.find(t=>t.id===id).date,c.id)).toBe(today);
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'统计',exact:true}).click();await page.getByRole('button',{name:'任务回顾',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'任务回顾'}),section=dialog.locator('.closeout-section');
 await expect(section).toContainText('2 项可重新安排');
 await expect(section.getByText('每日重复',{exact:true})).toHaveCount(0);
 await section.getByRole('checkbox',{name:/普通积压/}).check();
 await page.screenshot({path:'test-results/daily-closeout.png',animations:'disabled'});
 page.once('dialog',d=>d.accept());await section.getByRole('button',{name:'安排所选 1 项到明天'}).click();
 await expect.poll(()=>page.evaluate(ids=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks.filter(t=>ids.includes(t.id)).map(t=>t.date),[a.id,b.id,c.id])).toEqual([shiftDay(today,1),today,today]);
});
