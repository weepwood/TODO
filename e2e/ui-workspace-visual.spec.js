import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
async function seed(page){
 const state=initialState(),today=dayKey(),previous=shiftDay(today,-1);
 const task={...newTask('视觉验收','work',today),time:'09:00',duration:60,points:5};
 state.tasks=[task,{...newTask('完成记录','work',today),status:'completed',completedAt:new Date(today+'T12:00:00').toISOString()}];
 state.sessions=[{id:'session-a',taskId:task.id,mode:'focus',seconds:900,startedAt:new Date(previous+'T12:00:00').toISOString()},{id:'session-b',taskId:task.id,mode:'stopwatch',seconds:1200,startedAt:new Date(today+'T09:00:00').toISOString()},{id:'session-c',taskId:null,mode:'focus',seconds:600,startedAt:new Date(today+'T10:00:00').toISOString()}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);await page.goto('/');
}
test('看板语义元数据、日历事件色、专注分组及真实星期热力图',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 await page.getByRole('button',{name:'看板',exact:true}).click();
 const card=page.locator('.board-task-card').filter({hasText:'视觉验收'});
 await expect(card.locator('.board-card-meta')).toContainText('工作');await expect(card.locator('.board-card-meta')).toContainText('09:00');
 await page.getByRole('button',{name:'日历',exact:true}).click();
 const event=page.locator('.workspace-event-task').filter({hasText:'视觉验收'}).first();
 await expect(event).toBeVisible();await expect(event).toHaveCSS('border-radius','6px');
 await page.screenshot({path:'test-results/workspace-calendar-events.png',animations:'disabled'});
 await page.getByRole('button',{name:'专注',exact:true}).click();
 await expect(page.locator('.focus-history-day')).toHaveCount(2);
 await expect(page.locator('.focus-history-day').first()).toContainText('00:30:00');
 await expect(page.locator('.focus-record')).toHaveCount(3);
 await page.locator('.focus-history-day').first().scrollIntoViewIfNeeded();
 await page.screenshot({path:'test-results/workspace-focus-history.png',animations:'disabled'});
 await page.getByRole('button',{name:'统计',exact:true}).click();
 const heatmap=page.locator('.heatmap');
 await expect(heatmap.locator('i')).toHaveCount(364);
 const today=dayKey(),cell=heatmap.locator('[data-day="'+today+'"]');
 await expect(cell).toHaveAttribute('data-level','1');
 await expect(cell).toHaveCSS('grid-row-start',String(new Date(today+'T12:00:00').getDay()+1));
 await heatmap.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/workspace-heatmap.png',animations:'disabled'});
});
