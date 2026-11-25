import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {chooseOption} from './select-helper.js';
async function seed(page){
 const d=initialState(),today=dayKey(),a={...newTask('专注目标','work',today),duration:60};
 d.tasks=[a];d.sessions=[{id:'session-a',taskId:a.id,mode:'focus',seconds:1800,startedAt:today+'T10:00:00'}];
 d.templates=[{id:'template-a',name:'日常模板',task:{...a,repeat:'daily',checklist:[{id:'old-item',text:'阅读',done:true}]}}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');return {a,today};
}
test('任务专注预绑定、原计时保护及预计实际对比',async({page})=>{
 const {a}=await seed(page);await page.locator('[data-view-key=work]').click();await page.locator('.task-body').filter({hasText:'专注目标'}).click();
 await expect(page.locator('.task-time-comparison')).toContainText('剩余预计 30 分钟');
 await page.getByRole('button',{name:'前往专注',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'绑定任务'})).toContainText('专注目标');
 await expect(page.getByRole('spinbutton',{name:'专注分钟'})).toHaveValue('60');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).timer)).toBeNull();
 await page.getByRole('button',{name:'开始',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).timer?.taskId)).toBe(a.id);
 await page.getByRole('button',{name:'任务',exact:true}).click();await page.locator('[data-view-key=work]').click();await page.locator('.task-body').filter({hasText:'专注目标'}).click();
 await page.getByRole('button',{name:'查看当前计时'}).click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'绑定任务'})).toBeDisabled();
 await page.screenshot({path:'test-results/task-focus-workflow.png',animations:'disabled'});
});
test('模板创建前配置标题清单日期，检查项重置',async({page})=>{
 const {today}=await seed(page);await page.getByRole('button',{name:/任务模板/}).click();await page.getByRole('button',{name:'日常模板',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'从模板创建任务'});
 await dialog.getByRole('textbox',{name:'模板任务标题'}).fill('模板新任务');
 await chooseOption(dialog.getByRole('combobox',{name:'模板目标清单'}),'personal');
 await dialog.getByRole('button',{name:'今天',exact:true}).click();
 await page.screenshot({path:'test-results/template-create.png',animations:'disabled'});
 await dialog.getByRole('button',{name:'创建任务',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>{const t=JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks.find(t=>t.title==='模板新任务');return t&&[t.listId,t.date,t.duration,t.repeat,t.checklist[0].done]})).toEqual(['personal',today,60,'none',false]);
});

test('收藏清单独立持久化，不重复显示或改变归属',async({page})=>{
 await seed(page);
 const work=page.locator('[data-view-key=work]');
 await work.hover();await work.locator('..').getByRole('button',{name:'更多操作'}).click();
 await page.getByRole('menuitem',{name:'收藏清单',exact:true}).click();
 await expect(page.locator('.section-label').getByText('收藏清单',{exact:true})).toBeVisible();
 await expect(work).toHaveCount(1);
 await page.reload();await expect(page.locator('.section-label').getByText('收藏清单',{exact:true})).toBeVisible();
 await expect(work).toHaveCount(1);await work.click();
 await expect(page.locator('.task-body').filter({hasText:'专注目标'})).toBeVisible();
 await work.hover();await work.locator('..').getByRole('button',{name:'更多操作'}).click();
 await page.getByRole('menuitem',{name:'取消收藏',exact:true}).click();
 await expect(page.locator('.section-label').getByText('收藏清单',{exact:true})).toHaveCount(0);
 await expect(work).toHaveCount(1);
});
