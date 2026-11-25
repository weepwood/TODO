import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
import {chooseOption} from './select-helper.js';
import fs from 'node:fs/promises';
async function seed(page){
 const today=dayKey(),yesterday=shiftDay(today,-1),state=initialState();
 const a={...newTask('普通任务','inbox',today),duration:30,points:4},b={...newTask('置顶目标','inbox',today),duration:45,stage:'doing',points:7};
 const c={...newTask('昨日完成','work',yesterday),status:'completed',stage:'done',completedAt:yesterday+'T12:00:00',points:2};
 state.tasks=[a,b,c];state.sessions=[{id:'session',taskId:a.id,startedAt:today+'T10:00:00',seconds:1800,mode:'focus'}];state.habits=[{id:'habit',name:'阅读',days:[today],weeklyGoal:3}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);await page.goto('/');
 return {a,b,c,today};
}
test('置顶、延期、完成撤销、历史筛选及刷新持久化',async({page})=>{
 await page.setViewportSize({width:1440,height:900});const {b,today}=await seed(page);
 await page.locator('[data-view-key=inbox]').click();
 const menu=async(name)=>{await page.getByRole('button',{name:'任务操作 置顶目标'}).click();await page.getByRole('menuitem',{name,exact:true}).click()};
 await menu('置顶任务');await expect(page.locator('.task-body').first()).toContainText('置顶目标');
 await page.reload();await page.locator('[data-view-key=inbox]').click();await expect(page.locator('.task-body').first()).toContainText('置顶目标');
 await menu('延期一周');await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks.find(t=>t.id===id).date,b.id)).toBe(shiftDay(today,7));
 await page.getByRole('button',{name:'完成 置顶目标',exact:true}).click();
 await page.getByRole('button',{name:'撤销完成',exact:true}).click();
 await expect(page.getByRole('button',{name:'完成 置顶目标',exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks.find(t=>t.id===id).stage,b.id)).toBe('doing');
 await page.getByRole('button',{name:'完成 置顶目标',exact:true}).click();
 await page.locator('[data-view-key=completed]').click();
 await chooseOption(page.getByRole('combobox',{name:'完成时间范围'}),'today');
 await expect(page.locator('.task-body').filter({hasText:'昨日完成'})).toHaveCount(0);
 await expect(page.locator('.task-body').filter({hasText:'置顶目标'})).toBeVisible();
 await expect(page.locator('.task-row').filter({hasText:'置顶目标'}).locator('.task-date')).toHaveText('今天完成');
 await page.screenshot({path:'test-results/history-filter.png',animations:'disabled'});
});
test('每日及每周回顾、实际Markdown下载、重新安排任务',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 await page.getByRole('button',{name:'统计',exact:true}).click();
 await page.getByRole('button',{name:'任务回顾',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'任务回顾'});
 await expect(dialog.locator('.review-metrics')).toContainText('75 分钟');
 await expect(dialog.locator('.review-metrics')).toContainText('30 分钟');
 await dialog.getByRole('button',{name:'每周',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'每周',exact:true})).toHaveAttribute('aria-pressed','true');
 await dialog.getByRole('button',{name:'每日',exact:true}).click();
 const downloaded=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出 Markdown'}).click();
 const file=await downloaded;expect(file.suggestedFilename()).toMatch(/\.md$/);const content=await fs.readFile(await file.path(),'utf8');expect(content).toContain('实际专注：30 分钟');
 await page.screenshot({path:'test-results/task-review.png',animations:'disabled'});
 await dialog.locator('.review-task-row').filter({hasText:'普通任务'}).getByRole('button',{name:'安排明天'}).click();
 await expect(dialog.locator('.review-task-row').filter({hasText:'普通任务'})).toHaveCount(0);
 await expect(dialog.locator('.review-metrics')).toContainText('45 分钟');
});

test('手机回顾周期、无水平溢出及返回任务',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page);
 await page.getByRole('button',{name:'统计',exact:true}).click();
 await page.getByRole('button',{name:'任务回顾',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'任务回顾'});
 await expect(dialog).toBeVisible();
 await expect.poll(()=>dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await dialog.getByRole('button',{name:'每周',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'每周',exact:true})).toHaveAttribute('aria-pressed','true');
 await dialog.evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:'test-results/task-review-mobile.png',animations:'disabled'});
 await dialog.getByRole('button',{name:/普通任务/}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'任务标题',exact:true})).toHaveValue('普通任务');
});

test('长回顾独立滚动，标题、周期与导出操作保持可见',async({page})=>{
 await page.setViewportSize({width:1440,height:600});await seed(page);
 await page.getByRole('button',{name:'统计',exact:true}).click();
 await page.getByRole('button',{name:'任务回顾',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'任务回顾'}),body=dialog.locator('.review-scroll');
 await expect(body).toBeVisible();
 expect(await body.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 const title=dialog.getByRole('heading',{name:'任务回顾',exact:true}),toolbar=dialog.locator('.review-toolbar'),footer=dialog.getByRole('button',{name:'导出 Markdown'});
 const before=await title.boundingBox();
 await body.evaluate(el=>el.scrollTop=el.scrollHeight);
 expect((await title.boundingBox()).y).toBe(before.y);
 await expect(toolbar).toBeInViewport();await expect(footer).toBeInViewport();
 expect((await toolbar.boundingBox()).y).toBeGreaterThanOrEqual(before.y+before.height);
 await page.screenshot({path:'test-results/review-fixed-layout.png',animations:'disabled'});
});
