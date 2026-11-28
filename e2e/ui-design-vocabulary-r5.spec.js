import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
async function seed(page){
 const today=dayKey(),d=initialState();d.theme='dark';d.tasks=Array.from({length:5},(_,i)=>({...newTask('并发事项 '+i,'inbox',today),time:'09:00',duration:60}));d.tasks.push({...newTask('短事件','inbox',today),time:'10:30',duration:15});
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),d);await page.goto('/');
}
test('320px周历可横向浏览，日历原生更多入口保留并发事件',async({page})=>{
 await page.setViewportSize({width:320,height:700});await seed(page);await page.getByRole('button',{name:'日历',exact:true}).click();
 const calendar=page.locator('.calendar-main'),grid=calendar.locator('.calendar-viewport');
 await calendar.locator('button').filter({hasText:/^周$/}).click();await expect(calendar).toHaveAttribute('data-calendar-view','timeGridWeek');
 await expect.poll(()=>grid.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);
 const more=calendar.locator('.todo-calendar-more').first();await expect(more).toBeVisible();await more.click();
 await expect.poll(()=>page.locator('.todo-calendar-event-name').allTextContents()).toEqual(expect.arrayContaining(['⚠ 并发事项 0','⚠ 并发事项 1','⚠ 并发事项 2','⚠ 并发事项 3','⚠ 并发事项 4']));
 await page.keyboard.press('Escape');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('日期浮层碰撞起点、快速关闭重开及键盘回焦',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'no-preference'});await seed(page);await page.getByRole('button',{name:'日历',exact:true}).click();
 const trigger=page.getByRole('button',{name:'联动日历选择器',exact:true});await trigger.click();const popup=page.locator('.date-popover[data-state=open]');await expect(popup).toBeVisible();
 expect(await popup.evaluate(e=>getComputedStyle(e).getPropertyValue('--radix-popover-content-transform-origin').trim().length)).toBeGreaterThan(0);
 await page.keyboard.press('Escape');await expect(trigger).toBeFocused();await trigger.click();await expect(popup).toHaveCount(1);await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);await expect(trigger).toBeFocused();
});
