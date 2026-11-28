import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
test('窄周历横向滚动保留时间轴、短事件标题与并发入口',async({page})=>{
 await page.setViewportSize({width:390,height:844});const d=initialState(),today=dayKey();d.theme='dark';
 d.tasks=[...Array.from({length:5},(_,i)=>({...newTask('并发事项 '+i,'inbox',today),time:'09:00',duration:60})),{...newTask('15分钟短事件','inbox',today),time:'10:30',duration:15}];
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),d);await page.goto('/');await page.getByRole('button',{name:'日历',exact:true}).click();
 const calendar=page.locator('.calendar-main'),grid=calendar.locator('.calendar-viewport');
 await calendar.locator('button').filter({hasText:/^周$/}).click();await expect(calendar).toHaveAttribute('data-calendar-view','timeGridWeek');await grid.evaluate(e=>e.scrollLeft=e.scrollWidth-e.clientWidth);
 const hour=grid.locator('.todo-calendar-slot-label').filter({hasText:/^09:00$/}).first();
 await expect.poll(()=>hour.evaluate(e=>{const b=e.getBoundingClientRect(),a=e.closest('.calendar-viewport').getBoundingClientRect();return Math.abs(b.x-a.x)})).toBeLessThan(3);
 await expect.poll(()=>hour.evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+10,b.y+5))})).toBe(true);
 const short=calendar.locator('.todo-calendar-event-content[data-short=true]').filter({hasText:'15分钟短事件'});await expect(short.locator('.todo-calendar-event-name')).toBeVisible();await expect(short).toHaveAttribute('title',/10:30/);
 await expect(calendar.locator('.todo-calendar-more').first()).toBeVisible();
 await calendar.locator('button').filter({hasText:/^日$/}).click();await expect(calendar).toHaveAttribute('data-calendar-view','timeGridDay');
 await expect(calendar.locator('.todo-calendar-event-content[data-short=true]').filter({hasText:'15分钟短事件'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
