import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
import {chooseOption} from './select-helper.js';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
test('跨日多段规划保留预计时长，任务详情显示补充段',async({page})=>{
 const s=initialState(),today=dayKey();
 s.tasks=[{...newTask('多段验收','inbox',today,'split'),duration:600}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},s);
 await page.goto('/');await page.getByRole('button',{name:'每日规划',exact:true}).click();
 await chooseOption(page.getByRole('combobox',{name:'智能规划范围'}),'3');
 await page.getByRole('button',{name:'智能安排',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'智能时间安排'});await expect(dialog).toContainText('2 段');await dialog.getByRole('button',{name:'应用安排'}).click();
 await expect.poll(async()=>(await stored(page)).tasks[0].planSegments?.length).toBe(1);
 const task=(await stored(page)).tasks[0];expect(task.duration).toBe(600);expect(task.planMinutes+task.planSegments[0].minutes).toBe(600);
 await page.getByRole('button',{name:'后一天'}).click();await page.locator('button.time-block').filter({hasText:'多段验收'}).click();
 await expect(page.getByText('补充时间段 · 1',{exact:true})).toBeVisible();
});
test('今日积压批量延期只处理普通未锁定任务',async({page})=>{
 const s=initialState(),today=dayKey(),old=shiftDay(today,-1);
 s.tasks=[newTask('可延期验收','inbox',old,'a'),{...newTask('锁定验收','inbox',old,'b'),planLocked:true,planMinutes:30}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},s);
 await page.goto('/');const panel=page.getByRole('region',{name:'今日执行'});await panel.getByRole('button',{name:'展开执行清单'}).click();await panel.getByRole('button',{name:'积压',exact:true}).click();await panel.getByRole('button',{name:'选择可延期项'}).click();await panel.getByRole('button',{name:'预览批量延期'}).click();await panel.getByRole('button',{name:'确认延期'}).click();
 await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='a').date).toBe(shiftDay(today,1));expect((await stored(page)).tasks.find(t=>t.id==='b').date).toBe(old);
});
