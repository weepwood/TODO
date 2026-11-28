import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
async function seed(page){
 const d=initialState(),today=dayKey();
 d.tasks=[{...newTask('日历长标题与任务详情验收','inbox',today),time:'09:00',duration:60}, {...newTask('截止事项','inbox',today),deadline:today+'T18:00'}, {...newTask('昨日完成','inbox',shiftDay(today,-1)),status:'completed',stage:'done',completedAt:shiftDay(today,-1)+'T12:00:00'}];
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),d);await page.goto('/');
}
test('真实日历事件自有语义类、键盘可达与任务点击',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);await page.getByRole('button',{name:'日历',exact:true}).click();
 const event=page.locator('.workspace-event-task').filter({hasText:'日历长标题'}).first();
 await expect(event.locator('.todo-calendar-event-name')).toHaveText('日历长标题与任务详情验收');
 await expect(event.locator('.todo-calendar-event-time')).not.toBeEmpty();
 await expect(event.locator('.todo-calendar-event-content')).toHaveAttribute('data-kind','任务');
 await expect(page.locator('.workspace-event-deadline .todo-calendar-event-content')).toHaveAttribute('data-kind','截止');
 await event.click();await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('日历长标题与任务详情验收');
});
test('趋势图共同基线与零值，移动端保留滚动',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);await page.getByRole('button',{name:'统计',exact:true}).click();
 const plots=page.locator('.task-completion-chart .completion-plot');await expect(plots).toHaveCount(14);
 const values=await plots.evaluateAll(els=>els.map(e=>({bottom:e.getBoundingClientRect().bottom,height:e.querySelector('i').style.height})));
 expect(Math.max(...values.map(v=>v.bottom))-Math.min(...values.map(v=>v.bottom))).toBeLessThan(1);expect(values.some(v=>v.height==='0px')).toBe(true);
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.locator('.completion-scroll').evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);
});
test('分区折叠快速反向保留当前高度及草稿，减少动效立即隐藏',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'no-preference'});await seed(page);await page.locator('.task-body').first().click();
 const section=page.locator('[data-detail-section=checklist]'),body=section.locator('.detail-section-body');await expect(body).toBeVisible();
 await section.getByRole('textbox',{name:'新检查项'}).fill('未保存的草稿');
 const sample=await section.evaluate(el=>new Promise((resolve,reject)=>{const b=el.querySelector('.detail-section-body'),t=el.querySelector('.detail-section-toggle'),initial=b.getBoundingClientRect().height,deadline=performance.now()+500;t.click();const check=()=>{const h=b.getBoundingClientRect().height;if(h>0&&h<initial-1){const inert=b.inert;t.click();resolve({initial,h,inert});return}if(performance.now()>deadline){reject(Error('no intermediate disclosure height'));return}requestAnimationFrame(check)};requestAnimationFrame(check)}));
 expect(sample.inert).toBe(true);expect(sample.h).toBeLessThan(sample.initial);await expect(section.getByRole('textbox',{name:'新检查项'})).toHaveValue('未保存的草稿');await expect.poll(()=>body.evaluate(e=>e.getAnimations().length)).toBe(0);
 await page.emulateMedia({reducedMotion:'reduce'});await section.locator('.detail-section-toggle').click();await expect(body).toBeHidden();expect(await body.evaluate(e=>e.getAnimations().length)).toBe(0);
});
