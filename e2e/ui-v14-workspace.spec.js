import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
test('访客工作区阻止第二标签页写入，关闭首个窗口后可安全接管',async({page,context})=>{
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();
 const second=await context.newPage();await second.goto('/');await expect(second.getByRole('heading',{name:'工作空间已在另一个标签页打开'})).toBeVisible();
 await page.close();await second.getByRole('button',{name:'重新打开'}).click();await expect(second.getByRole('textbox',{name:'新任务名称'})).toBeVisible();
});
test('规则折叠不丢失配置，执行记录筛选和实际时间图表',async({page})=>{
 const today=dayKey(),d=initialState(),t={...newTask('图表任务','work',today),status:'completed',stage:'done',completedAt:today+'T12:00:00'};
 d.tasks=[t];d.sessions=[{id:'s',taskId:t.id,mode:'focus',seconds:3600,startedAt:today+'T09:00:00'}];
 d.workflowRuns=[{id:'r',at:today+'T10:00:00Z',trigger:'manual',changes:[{id:t.id,title:t.title,before:{priority:0},after:{priority:3}}]}];
 const config={auto:false,lastRun:'',rules:[{id:'r',name:'周期检查',list:'all',condition:'today',extra:'todo',match:'all',action:'high',trigger:'daily',enabled:true}]};
 await page.addInitScript(({d,config})=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d));localStorage.setItem('todo-workflow-rules-v1',JSON.stringify(config))},{d,config});
 await page.setViewportSize({width:1440,height:900});await page.goto('/');
 await page.locator('[data-view-key=today]').click();await page.getByRole('button',{name:'今日更多操作'}).click();await page.getByRole('menuitem',{name:'自动化',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'任务工作流自动化'});
 await expect(dialog.getByLabel('规则流程 1')).toContainText('且');
 await dialog.getByRole('button',{name:'折叠规则 1'}).click();await expect(dialog.getByRole('textbox',{name:'规则名称 1'})).toBeHidden();
 await dialog.getByRole('button',{name:'展开规则 1'}).click();await expect(dialog.getByRole('textbox',{name:'规则名称 1'})).toHaveValue('周期检查');
 await page.screenshot({path:'test-results/v14-rules.png',animations:'disabled'});
 await dialog.getByRole('button',{name:'不可撤销',exact:true}).click();await expect(dialog).toContainText('任务已变更，无法安全撤销');
 await dialog.getByText('查看变更',{exact:true}).click();await expect(dialog.locator('.workflow-change')).toContainText('优先级');
 await dialog.getByRole('textbox',{name:'搜索执行记录'}).fill('不存在');await expect(dialog).toContainText('暂无匹配执行记录');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'统计',exact:true}).click();
 await page.getByRole('group',{name:'热力图指标'}).getByRole('button',{name:'专注时间'}).click();await expect(page.locator('.heatmap')).toHaveAttribute('aria-label',/60 分钟/);
 await page.getByRole('button',{name:'任务回顾'}).click();const review=page.getByRole('dialog',{name:'任务回顾'});
 await review.getByRole('button',{name:'每月'}).click();await expect(review.locator('.review-line')).toHaveCount(3);await expect(review.locator('.review-time-row').filter({hasText:'工作'})).toContainText('60 分钟');
 await review.locator('.review-long-charts').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/v14-review.png',animations:'disabled'});
});
