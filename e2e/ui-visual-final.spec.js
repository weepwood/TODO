import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
for(const theme of ['light','dark'])test('目标、自动化空态与报告布局 '+theme,async({page})=>{
 const d=initialState();d.theme=theme;d.tasks=[newTask('回顾任务','inbox',dayKey(),'task')];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.goto('/');mkdirSync('test-results/visual-final',{recursive:true});
 await page.getByRole('button',{name:'打开目标管理',exact:true}).first().click();const goal=page.locator('.goal-workspace');await expect(goal).toBeVisible();
 await expect(goal.locator('.goal-progress-value strong')).toHaveCount(4);expect(await goal.locator('.goal-progress-value strong').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
 await page.screenshot({path:'test-results/visual-final/'+theme+'-goals.png',animations:'disabled'});
 await page.getByRole('button',{name:'打开自动化工作台',exact:true}).first().click();const workflow=page.locator('.workspace-surface.workflow-dialog');await expect(workflow.getByText('尚未创建自动化规则')).toBeVisible();
 await page.screenshot({path:'test-results/visual-final/'+theme+'-workflow.png',animations:'disabled'});await workflow.getByRole('button',{name:'执行预览',exact:true}).click();await expect(workflow.getByText('暂无匹配任务')).toBeVisible();
 await page.getByRole('button',{name:'打开回顾报告',exact:true}).first().click();const report=page.locator('.workspace-surface.task-review-dialog');await expect(report.locator('.review-scroll')).toBeVisible();
 const footer=report.locator('.review-footer');expect(await footer.evaluate(el=>getComputedStyle(el).position)).toBe('static');
 await page.screenshot({path:'test-results/visual-final/'+theme+'-report.png',animations:'disabled'});await footer.scrollIntoViewIfNeeded();await expect(footer.getByRole('button',{name:'导出 Markdown'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
