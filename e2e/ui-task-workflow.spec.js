import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {chooseOption} from './select-helper.js';
async function seed(page){
 const d=initialState(),today=dayKey(),a={...newTask('专注目标','work',today),duration:60};
 d.focusConfig.ignoreShortSessions=false;d.tasks=[a];d.sessions=[{id:'session-a',taskId:a.id,mode:'focus',seconds:1800,startedAt:today+'T10:00:00'}];
 d.templates=[{id:'template-a',name:'日常模板',task:{...a,repeat:'daily',checklist:[{id:'old-item',text:'阅读',done:true}]}}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');return {a,today};
}
test('任务内计时胶囊、跨工作台联动与预计实际对比',async({page})=>{
 const {a}=await seed(page);await page.locator('[data-view-key=work]').click();await page.locator('.task-body').filter({hasText:'专注目标'}).click();
 await expect(page.locator('.task-time-comparison')).toContainText('剩余预计 30 分钟');
 const focus=page.getByRole('group',{name:'任务内专注'}),stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
 await expect(focus.getByRole('button',{name:'开始正计时'})).toContainText('00:00');
 await expect(focus.getByRole('button',{name:'开始番茄钟'})).toContainText('30:00');
 await focus.getByRole('button',{name:'开始正计时'}).click();await expect.poll(async()=>(await stored()).timer?.taskId).toBe(a.id);
 await expect(focus.getByRole('button',{name:'暂停当前专注'})).toBeVisible();
 await expect.poll(async()=>(await focus.locator('.focus-capsule-time').textContent())).not.toBe('00:00');
 await focus.getByRole('button',{name:'暂停当前专注'}).click();await expect.poll(async()=>(await stored()).timer?.startedAt).toBeNull();
 await page.reload();await page.locator('[data-view-key=work]').click();await page.locator('.task-body').filter({hasText:'专注目标'}).click();
 await expect(focus.getByRole('button',{name:'继续当前专注'})).toBeVisible();await focus.getByRole('button',{name:'继续当前专注'}).click();
 await page.screenshot({path:'test-results/task-focus-workflow.png',animations:'disabled'});
 await page.locator('.rail').getByRole('button',{name:'专注',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'绑定任务'})).toContainText('专注目标');await expect(page.getByRole('combobox',{name:'绑定任务'})).toBeDisabled();
 await page.getByRole('button',{name:'暂停',exact:true}).click();await page.locator('.rail').getByRole('button',{name:'任务',exact:true}).click();await page.locator('[data-view-key=work]').click();await page.locator('.task-body').filter({hasText:'专注目标'}).click();
 await expect(focus.getByRole('button',{name:'继续当前专注'})).toBeVisible();await focus.getByRole('button',{name:'结束并保存专注'}).click();
 await expect.poll(async()=>(await stored()).sessions.length).toBe(2);await expect.poll(async()=>(await stored()).timer).toBeNull();
 const remaining=3600-(await stored()).sessions.filter(s=>s.taskId===a.id).reduce((n,s)=>n+s.seconds,0);await focus.getByRole('button',{name:'开始番茄钟'}).click();await expect.poll(async()=>(await stored()).timer?.target).toBe(remaining);
 await expect(focus.getByRole('button',{name:'暂停当前专注'})).toContainText('番茄钟');
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

for(const ignore of [true,false])test('不足一分钟专注设置与结算 '+(ignore?'默认忽略':'关闭后保存'),async({page})=>{
 const state=initialState(),task=newTask('短时专注验收','inbox',dayKey());
 state.tasks=[task];state.timer={mode:'stopwatch',target:0,elapsed:59,startedAt:null,createdAt:new Date().toISOString(),taskId:task.id};
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');
 await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'专注',exact:true}).click();
 const preference=page.getByRole('switch',{name:'忽略不足 1 分钟的专注'});
 await expect(preference).toHaveAttribute('aria-checked','true');
 if(!ignore)await preference.click();
 await expect(preference).toHaveAttribute('aria-checked',String(ignore));
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
 await expect.poll(async()=>(await stored()).focusConfig.ignoreShortSessions).toBe(ignore);
 await page.reload();await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'专注',exact:true}).click();
 await expect(preference).toHaveAttribute('aria-checked',String(ignore));
 await page.getByRole('dialog',{name:'设置与数据管理'}).getByRole('button',{name:'关闭',exact:true}).click();
 await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'短时专注验收'}).click();
 await page.getByRole('button',{name:'结束并保存专注'}).click();
 await expect.poll(async()=>(await stored()).timer).toBeNull();
 await expect.poll(async()=>(await stored()).sessions.length).toBe(ignore?0:1);
 if(!ignore)expect((await stored()).sessions[0].seconds).toBe(59);
});

test('智能番茄规划三种策略、设置持久化及运行目标稳定',async({page})=>{
 const state=initialState(),task={...newTask('智能计划验收','inbox',dayKey()),duration:80};
 state.tasks=[task];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'智能计划验收'}).click();
 const focus=page.getByRole('group',{name:'任务内专注'}),budget=focus.getByRole('group',{name:'专注时间预算'}),stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
 await expect(budget).toContainText('3 个待执行番茄');await expect(focus.getByRole('button',{name:'开始番茄钟'})).toContainText('25:00');
 await budget.getByRole('button',{name:'查看番茄计划'}).click();const pop=page.getByRole('dialog',{name:'查看番茄计划设置'});await expect(pop).toContainText('30 分钟');await expect(pop).toContainText('预计合计 90 分钟');await pop.getByRole('button',{name:'关闭',exact:true}).click();
 async function settings(){await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'专注',exact:true}).click()}
 async function close(){await page.getByRole('dialog',{name:'设置与数据管理'}).getByRole('button',{name:'关闭',exact:true}).click()}
 await settings();await expect(page.getByRole('switch',{name:'根据预计时长规划番茄钟'})).toHaveAttribute('aria-checked','true');
 await expect(page.getByRole('switch',{name:'自动扣除已专注时长'})).toHaveAttribute('aria-checked','true');
 await chooseOption(page.getByRole('combobox',{name:'尾段番茄处理'}),'strict');await close();await expect(budget).toContainText('4 个待执行番茄');
 await settings();await chooseOption(page.getByRole('combobox',{name:'尾段番茄处理'}),'balanced');await close();await expect(focus.getByRole('button',{name:'开始番茄钟'})).toContainText('20:00');
 await focus.getByRole('button',{name:'开始番茄钟'}).click();await expect.poll(async()=>(await stored()).timer?.target).toBe(1200);
 const duration=page.locator('[data-detail-section=plan]').getByRole('spinbutton',{name:'预计分钟'});await duration.fill('40');await duration.press('Enter');await expect.poll(async()=>(await stored()).tasks[0].duration).toBe(40);
 await expect.poll(async()=>(await stored()).timer.target).toBe(1200);
 await expect(budget).toContainText('1 个待执行番茄');
 await focus.getByRole('button',{name:'暂停当前专注'}).click();
 await page.screenshot({path:'test-results/pomodoro-plan-desktop.png',animations:'disabled'});
 await page.reload();await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'智能计划验收'}).click();
 await expect(focus.getByRole('button',{name:'继续当前专注'})).toBeVisible();await expect.poll(async()=>(await stored()).timer.target).toBe(1200);await expect.poll(async()=>(await stored()).focusConfig.planStrategy).toBe('balanced');
 await focus.getByRole('button',{name:'结束并保存专注'}).click();await settings();await page.getByRole('switch',{name:'根据预计时长规划番茄钟'}).click();await close();await expect(focus.getByRole('button',{name:'开始番茄钟'})).toContainText('25:00');await expect(budget).not.toContainText('智能番茄规划');
});

test('计时界面未打开时仍独立结算后台番茄并保留记录',async({page})=>{
 const state=initialState(),now=new Date(2026,10,26,12,0,0),task=newTask('后台计时验收','inbox',dayKey(now));
 state.tasks=[task];state.timer={mode:'focus',target:60,elapsed:0,startedAt:now.getTime()-58000,createdAt:new Date(now.getTime()-58000).toISOString(),taskId:task.id};
 await page.clock.install({time:now});
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
 await page.clock.runFor(4000);
 await expect.poll(async()=>(await stored()).sessions.length).toBe(1);await expect.poll(async()=>(await stored()).timer).toBeNull();
 expect((await stored()).sessions[0].seconds).toBe(60);
 await page.clock.runFor(4000);expect((await stored()).sessions.length).toBe(1);
 await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'后台计时验收'}).click();
 await expect(page.getByRole('group',{name:'任务内专注'})).toContainText('实际专注 1 分钟');
});
