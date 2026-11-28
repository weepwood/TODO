import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
for(const [width,theme] of [[1440,'light'],[390,'dark']]){
 test('日历统一控件与事件圆角 '+width,async({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  const d=initialState(),today=dayKey();d.theme=theme;d.tasks=Array.from({length:5},(_,i)=>({...newTask('设计检查 '+i,'inbox',today),time:'09:00',duration:60}));
  await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),d);await page.goto('/');
  await page.getByRole('button',{name:'日历',exact:true}).click();
  const cal=page.locator('.calendar-main');
  for(const [label,view] of [['月','dayGridMonth'],['周','timeGridWeek'],['日','timeGridDay']]){
   await cal.locator('button').filter({hasText:new RegExp('^'+label+'$')}).click();
   await expect(cal).toHaveAttribute('data-calendar-view',view);
   await expect(cal.locator('.todo-calendar-button-selected')).toHaveCount(1);
   const styles=await cal.locator('button.todo-calendar-button').evaluateAll(es=>es.map(e=>({r:getComputedStyle(e).borderRadius,h:e.getBoundingClientRect().height,shadow:getComputedStyle(e).boxShadow})));
   expect(styles.length).toBe(5);expect(styles.every(v=>v.r==='8px'&&v.shadow==='none'&&Math.abs(v.h-(width<860?44:36))<1)).toBe(true);
   await expect(cal.locator('.workspace-event').first()).toBeVisible();
   expect(await cal.locator('.workspace-event').first().evaluate(e=>getComputedStyle(e).borderRadius)).toBe('6px');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await cal.locator('button').filter({hasText:/^月$/}).click();await expect(cal).toHaveAttribute('data-calendar-view','dayGridMonth');
  await cal.locator('.todo-calendar-more').first().click();
  const popup=page.locator('.todo-calendar-popover');await expect(popup).toBeVisible();
  expect(await popup.evaluate(e=>getComputedStyle(e).borderRadius)).toBe('10px');
  await popup.locator('.todo-calendar-popover-close').click();await expect(popup).toHaveCount(0);
  await page.getByRole('button',{name:'隐藏任务栏'}).click();await expect(page.locator('.calendar-agenda')).toHaveCount(0);
  await page.getByRole('button',{name:'显示任务栏'}).click();await expect(page.locator('.calendar-agenda')).toBeVisible();
 });
}
