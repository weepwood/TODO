import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
async function seed(page){
 const s=initialState(),today=dayKey();s.tasks=[{...newTask('阶段验收任务','inbox',today,'a'),duration:30},{...newTask('第二任务','inbox',today,'b'),duration:20}];s.habits=[{id:'h',name:'阅读习惯',days:[],weeklyGoal:7,includeInPlan:true}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},s);
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();return today;
}
test('截止期限、计划预览、字段显示和习惯联动',async({page})=>{
 const fixedClock=new Date();fixedClock.setHours(8,0,0,0);await page.clock.setFixedTime(fixedClock);
 const today=await seed(page);await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'阶段验收任务'}).click();
 const detail=page.locator('[data-detail-section=plan]');await detail.getByRole('button',{name:'截止日期',exact:true}).click();
 const popup=page.getByRole('dialog',{name:'截止日期设置'});await popup.getByRole('button',{name:'明天',exact:true}).click();await popup.getByRole('button',{name:'保存截止'}).click();
 await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='a').deadline).toBeTruthy();
 expect((await stored(page)).tasks.find(t=>t.id==='a').date).toBe(today);
 await page.getByRole('button',{name:'新建智能清单',exact:true}).click();
 const smart=page.getByRole('dialog',{name:'新建智能清单'});await smart.getByRole('textbox',{name:'智能清单名称'}).fill('七天截止');
 await smart.getByRole('combobox',{name:'日期条件'}).click();await page.getByRole('option',{name:'七天内截止',exact:true}).click();
 await smart.getByRole('button',{name:'保存智能清单'}).click();await expect(page.locator('.task-body').filter({hasText:'阶段验收任务'})).toBeVisible();
 expect((await stored(page)).smartLists??[]).toEqual([]);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('todo-deadline-smart-lists-v1'))[0].name)).toBe('七天截止');
 await page.locator('[data-view-key=inbox]').click();

 await page.getByRole('button',{name:'分组、排序与顺序'}).click();await page.getByRole('menuitem',{name:'显示字段'}).click();await page.getByRole('menuitemcheckbox',{name:'预计时长'}).click();await page.keyboard.press('Escape');await expect(page.locator('[data-row-id=a]')).toContainText('30 分钟');
 await page.locator('.rail').getByRole('button',{name:'每日规划',exact:true}).click();
 await page.getByRole('checkbox',{name:'规划打卡 阅读习惯'}).check();await expect.poll(async()=>(await stored(page)).habits[0].days).toContain(today);
 await page.getByRole('button',{name:'智能安排',exact:true}).click();const plan=page.getByRole('dialog',{name:'智能时间安排'});await expect(plan).toContainText('阶段验收任务');await plan.getByRole('button',{name:'应用安排'}).click();await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='a').time).toBeTruthy();
});
test('专注队列持久化及CSV追加去重',async({page})=>{
 const today=await seed(page);await page.locator('.rail').getByRole('button',{name:'专注',exact:true}).click();
 const queue=page.getByRole('region',{name:'今日专注队列'});await queue.getByRole('button',{name:'加入今日与积压'}).click();await expect(queue).toContainText('阶段验收任务');await queue.getByRole('button',{name:'启动下一任务'}).click();
 await expect.poll(async()=>(await stored(page)).timer?.taskId).toBe('a');
 await expect(queue.getByRole('button',{name:'启动下一任务'})).toBeDisabled();await page.reload();await page.locator('.rail').getByRole('button',{name:'专注',exact:true}).click();await expect(queue).toContainText('第二任务');
 await page.getByRole('button',{name:'重置',exact:true}).click();await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();await page.getByRole('button',{name:'CSV / Markdown 任务交换'}).click();
 const dialog=page.getByRole('dialog',{name:'任务数据交换'});await dialog.getByRole('textbox',{name:'交换文本'}).fill('title,date,duration\n导入验收,'+today+',40\n导入验收,'+today+',40');await dialog.getByRole('button',{name:'解析预览'}).click();await expect(dialog).toContainText('1 重复');await dialog.getByRole('button',{name:'确认追加 1 项'}).click();
 await expect.poll(async()=>(await stored(page)).tasks.filter(t=>t.title==='导入验收').length).toBe(1);await expect(dialog).toContainText('已追加 1 项');
 await dialog.getByRole('button',{name:'解析预览'}).click();await expect(dialog).toContainText('2 重复');
});

test('独立月度与年度目标分别保存与刷新',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'打开目标管理',exact:true}).click();
 const panel=page.locator('.review-section').filter({hasText:'独立周期目标'});await panel.getByRole('button',{name:'设置本周期'}).click();
 const task=panel.getByRole('spinbutton',{name:'周期任务目标'});await task.fill('18');await task.press('Enter');await panel.getByRole('button',{name:'保存周期目标'}).click();await expect(panel).toContainText('0 / 18 项');
 await panel.getByRole('button',{name:'年度',exact:true}).click();await panel.getByRole('button',{name:'设置本周期'}).click();await task.fill('200');await task.press('Enter');await panel.getByRole('button',{name:'保存周期目标'}).click();await expect(panel).toContainText('0 / 200 项');
 await page.reload();await page.getByRole('button',{name:'打开目标管理',exact:true}).click();await expect(panel).toContainText('0 / 18 项');await panel.getByRole('button',{name:'年度',exact:true}).click();await expect(panel).toContainText('0 / 200 项');
});
