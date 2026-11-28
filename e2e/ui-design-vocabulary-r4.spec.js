import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
async function seed(page,theme='light'){
 const d=initialState(),today=dayKey();d.theme=theme;
 d.tasks=[{...newTask('重叠任务甲','inbox',today),time:'09:00',duration:60},{...newTask('重叠任务乙','work',today),time:'09:30',duration:90},{...newTask('截止事项','inbox',today),deadline:today+'T18:00'}];
 d.calendarEvents=[{id:'fixture-external',title:'外部会议',start:today+'T09:00:00',end:today+'T11:00:00',allDay:false,source:'工作日历'}];
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),d);await page.goto('/');
}
for(const [width,theme] of [[1440,'light'],[390,'dark']])test('周日历重叠、外部来源和时间轴 '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await seed(page,theme);await page.getByRole('button',{name:'日历',exact:true}).click();
 const calendar=page.locator('.calendar-main');
 await calendar.locator('button').filter({hasText:/^周$/}).click();
 await expect(calendar.locator('.todo-calendar-slot-label').first()).toBeVisible();
 const event=calendar.locator('.workspace-event-task').filter({hasText:'重叠任务甲'}).first(),external=calendar.locator('.workspace-event-external').first();
 await expect(event.locator('.todo-calendar-event-content')).toHaveAttribute('data-conflict','true');
 await expect(external.locator('.todo-calendar-event-content')).toHaveAttribute('title',/工作日历/);
 await expect(event.locator('.todo-calendar-event-time')).toContainText('09:00');
 await expect(external.locator('.todo-calendar-event-content')).toHaveAttribute('data-kind','外部');
 await expect(event).toHaveAttribute('tabindex','0');await event.focus();await expect(event).toBeFocused();
 await calendar.locator('button').filter({hasText:/^日$/}).click();
 await expect(calendar.locator('.todo-calendar-slot-label').first()).toBeVisible();
 await expect(event).toBeAttached();await event.click();await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('重叠任务甲');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('移动导航共享弹簧连续重定向并在减少动效时立即定位',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'no-preference'});await seed(page,'dark');
 const nav=page.getByRole('navigation',{name:'移动端主导航'}),mark=nav.locator('.mobile-nav-indicator');await expect(mark).toBeVisible();
 const sample=await nav.evaluate(n=>new Promise((resolve,reject)=>{const mark=n.querySelector('.mobile-nav-indicator'),buttons=n.querySelectorAll(':scope > button');buttons[2].click();const deadline=performance.now()+700;const tick=()=>{const v=Number(mark.style.getPropertyValue('--nav-position'));if(v>.05&&v<1.95){buttons[0].click();resolve(v);return}if(performance.now()>deadline){reject(Error('no intermediate spring position'));return}requestAnimationFrame(tick)};requestAnimationFrame(tick)}));
 expect(sample).toBeGreaterThan(0);await expect.poll(()=>mark.evaluate(e=>Number(e.style.getPropertyValue('--nav-position')))).toBe(0);
 await page.emulateMedia({reducedMotion:'reduce'});await nav.getByRole('button',{name:'统计',exact:true}).click();await expect.poll(()=>mark.evaluate(e=>Number(e.style.getPropertyValue('--nav-position')))).toBe(3);
});
