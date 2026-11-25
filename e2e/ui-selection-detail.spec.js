import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
async function seed(page){
 const state=initialState(),today=dayKey();
 state.tasks=['工作计划','阅读文档','整理资料'].map(title=>newTask(title,'inbox',today));
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1')){localStorage.setItem('todo-workbench-v1',JSON.stringify(data));localStorage.setItem('todo-panel-layout-v1',JSON.stringify({sidebar:310,detail:540}));localStorage.setItem('todo-appearance-v1',JSON.stringify({accent:'violet',density:'regular',font:'normal'}))}},state);
 await page.goto('/');
}
test('导航和任务短胶囊选中态与独立间距',async({page})=>{
 await page.setViewportSize({width:1520,height:991});await seed(page);
 const inbox=page.locator('[data-view-key=inbox]'),today=page.locator('[data-view-key=today]');
 await inbox.click();
 const marker=el=>el.evaluate(e=>({height:parseFloat(getComputedStyle(e,'::before').height),shadow:getComputedStyle(e).boxShadow}));
 await expect.poll(async()=>(await marker(inbox)).height).toBe(19);
 expect((await marker(inbox)).shadow).toBe('none');
 await today.click();
 await expect.poll(async()=>(await marker(today)).height).toBe(19);
 await expect.poll(async()=>(await marker(inbox)).height).toBe(5);
 const a=await inbox.boundingBox(),b=await today.boundingBox();expect(b.y-a.y-a.height).toBeGreaterThanOrEqual(3);
 const rows=page.locator('.task-row');await rows.first().locator('.task-body').click();
 await expect.poll(async()=>(await marker(rows.first())).height).toBe(19);
 const r0=await rows.nth(0).boundingBox(),r1=await rows.nth(1).boundingBox();expect(r1.y-r0.y-r0.height).toBeGreaterThanOrEqual(3);
 await rows.nth(1).locator('.task-body').click();
 await expect.poll(async()=>(await marker(rows.first())).height).toBe(5);
 await expect.poll(async()=>(await marker(rows.nth(1))).height).toBe(19);
 expect((await marker(rows.nth(1))).shadow).toBe('none');
 await page.screenshot({path:'test-results/selection-detail-violet.png',animations:'disabled'});
});
test('时间与步进控件完整填充且值可操作',async({page})=>{
 await page.setViewportSize({width:1520,height:991});await seed(page);
 await page.locator('.task-row').first().locator('.task-body').click();
 const time=page.getByRole('textbox',{name:'计划时间',exact:true}),trigger=page.getByRole('button',{name:'计划时间选择器',exact:true});
 const box=await time.boundingBox(),button=await trigger.boundingBox(),outer=await page.locator('.detail-content .time-control').first().boundingBox();
 expect(outer.x+outer.width-button.x-button.width).toBeLessThan(6);
 expect(button.x-box.x-box.width).toBeLessThan(6);
 await time.fill('09:45');await time.blur();
 const number=page.getByRole('spinbutton',{name:'预计分钟',exact:true});
 await page.getByRole('button',{name:'预计分钟增加'}).click();await expect(number).toHaveValue('31');
 const step=await page.getByRole('button',{name:'预计分钟增加'}).boundingBox(),group=await number.locator('xpath=../..').boundingBox();
 expect(group.x+group.width-step.x-step.width).toBeLessThan(6);
 await page.getByRole('spinbutton',{name:'任务积分',exact:true}).fill('-5');await page.getByRole('spinbutton',{name:'任务积分',exact:true}).press('Enter');
 await page.screenshot({path:'test-results/selection-detail-controls.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 await expect(time).toHaveValue('09:45');await expect(number).toHaveValue('31');
 await expect(page.getByRole('spinbutton',{name:'任务积分',exact:true})).toHaveValue('-5');
 await page.screenshot({path:'test-results/selection-detail-mobile.png',animations:'disabled'});
});
