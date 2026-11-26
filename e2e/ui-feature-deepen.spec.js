import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
async function seed(page){
 const s=initialState(),today=dayKey();s.tasks=[{...newTask('深化验收甲','inbox',today,'a'),duration:30},{...newTask('深化验收乙','inbox',today,'b'),duration:20,deadline:today}];
 s.sessions=[{id:'saved',taskId:'a',mode:'focus',seconds:600,startedAt:new Date().toISOString()}];
 s.habits=[{id:'h',name:'阅读周期',days:[],weeklyGoal:7,includeInPlan:true}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},s);
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();return today;
}
test('今日执行与智能占位分离、锁定后禁止计划移动',async({page})=>{
 await seed(page);
 await page.getByRole('button',{name:'展开执行清单'}).click();await expect(page.getByRole('region',{name:'今日执行'})).toContainText('深化验收乙');
 await page.locator('.rail').getByRole('button',{name:'每日规划',exact:true}).click();await page.getByRole('button',{name:'智能安排',exact:true}).click();const plan=page.getByRole('dialog',{name:'智能时间安排'});await expect(plan).toContainText('占位 20 分钟');await plan.getByRole('button',{name:'应用安排'}).click();
 await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='a').planMinutes).toBe(20);
 expect((await stored(page)).tasks.find(t=>t.id==='a').duration).toBe(30);
 await page.locator('.rail').getByRole('button',{name:'任务',exact:true}).click();await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'深化验收甲'}).click();
 const detail=page.locator('[data-detail-section=plan]');await detail.getByRole('button',{name:'锁定时间块',exact:true}).click();await expect(detail.getByRole('button',{name:'解除锁定',exact:true})).toBeVisible();await expect(detail.getByRole('button',{name:'计划日期',exact:true})).toHaveCount(0);
 await page.locator('.rail').getByRole('button',{name:'每日规划',exact:true}).click();await expect(page.getByRole('button',{name:'移动时间 深化验收甲'})).toHaveCount(0);await expect(page.getByRole('button',{name:'调整时长 深化验收甲'})).toHaveCount(0);
});
test('连续会话启动、周期习惯和导入批次刷新后撤销',async({page})=>{
 await seed(page);await page.locator('.rail').getByRole('button',{name:'专注',exact:true}).click();
 const queue=page.getByRole('region',{name:'今日专注队列'});await queue.getByRole('button',{name:'加入今日与积压'}).click();
 await queue.getByRole('spinbutton',{name:'会话目标分钟'}).fill('35');await queue.getByRole('spinbutton',{name:'会话目标分钟'}).press('Enter');await queue.getByRole('button',{name:'启动连续会话'}).click();
 await expect.poll(async()=>(await stored(page)).timer?.queueRun?.goal).toBe(2100);
 await page.getByRole('button',{name:'重置',exact:true}).click();
 await page.locator('.rail').getByRole('button',{name:'习惯',exact:true}).click();await page.getByRole('button',{name:'阅读周期 规划星期一'}).click();await expect.poll(async()=>(await stored(page)).habits[0].planWeekdays).not.toContain(1);
 await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();await page.getByRole('button',{name:'CSV / Markdown 任务交换'}).click();
 const dialog=page.getByRole('dialog',{name:'任务数据交换'});await dialog.getByRole('textbox',{name:'交换文本'}).fill('title,points,planMinutes\n独立撤销验收,-3,20');await dialog.getByRole('button',{name:'解析预览'}).click();await dialog.getByRole('button',{name:'确认追加 1 项'}).click();
 await expect.poll(async()=>(await stored(page)).importRuns?.length).toBe(1);
 await page.reload();await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();await page.getByRole('button',{name:'CSV / Markdown 任务交换'}).click();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'撤销导入',exact:true}).click();await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.title==='独立撤销验收').deletedAt).toBeTruthy();
 expect((await stored(page)).tasks.find(t=>t.title==='独立撤销验收').points).toBe(-3);
});
