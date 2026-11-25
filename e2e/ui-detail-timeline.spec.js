import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {chooseOption} from './select-helper.js';
test.use({storageState:{cookies:[],origins:[]}});
async function seed(page){
 const data=initialState(),today=dayKey();
 data.tasks=[{...newTask('快捷验收','inbox',today),time:'09:00',duration:30},{...newTask('重叠目标','inbox',today),time:'10:00',duration:60},{...newTask('只读记录','inbox',today),status:'completed',completedAt:new Date().toISOString()}];
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(data))},data);
 await page.goto('/');
}
test('属性直接操作、浮层不改变卡片位置及已完成只读保护',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 await page.locator('.task-body').filter({hasText:'快捷验收'}).click();
 const detail=page.locator('.detail-content'),plan=detail.locator('[data-detail-section=plan]'),org=detail.locator('[data-detail-section=organization]');
 const duration=plan.getByRole('spinbutton',{name:'预计分钟'});await duration.fill('45');await duration.press('Enter');await expect(duration).toHaveValue('45');
 const before=await org.boundingBox(),priority=org.getByRole('combobox',{name:'优先级',exact:true});
 await chooseOption(priority,'3');await expect(priority).toContainText('高优先级');
 expect(Math.abs((await org.boundingBox()).y-before.y)).toBeLessThan(2);
 await page.screenshot({path:'test-results/detail-quick-edit.png',animations:'disabled'});
 await page.locator('.nav-row').filter({hasText:'已完成'}).click();await page.locator('.task-body').filter({hasText:'只读记录'}).click();
 await expect(detail.getByRole('spinbutton')).toHaveCount(0);
 await expect(detail.getByRole('combobox')).toHaveCount(0);
 await expect(detail.getByRole('button',{name:'提醒',exact:true})).toHaveCount(0);
 await expect(detail.getByRole('textbox',{name:'任务备注'})).toHaveAttribute('readonly','');
});
test('时间块拖动预览重叠提示、原值不提前提交、落点正确',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const handle=page.getByRole('button',{name:'移动时间 快捷验收'}),block=page.locator('button.time-block').filter({hasText:'快捷验收'});
 await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();
 const h=await page.locator('.time-block-body').evaluate(el=>parseFloat(el.style.getPropertyValue('--hour-size')));
 const x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+h,{steps:4});
 await expect(page.locator('.time-move-preview')).toHaveAttribute('data-conflict','true');
 await expect(page.locator('.time-move-preview')).toHaveCSS('opacity','1');
 await expect(page.locator('.time-drop-guide')).toContainText('时间重叠');
 await expect(block).toHaveAttribute('aria-label',/09:00–09:30/);
 await page.screenshot({path:'test-results/timeline-overlap-preview.png',animations:'disabled'});
 await page.mouse.up();
 await expect(page.locator('.time-move-preview')).toHaveCount(0);
 await expect(block).toHaveAttribute('aria-label',/10:00–10:30.*时间重叠/);
});

test('拉伸实时反馈并取消，不提交预览时长',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 await page.getByRole('button',{name:'每日规划',exact:true}).click();
 await chooseOption(page.getByRole('combobox',{name:'时间轴密度'}),'112');
 const handle=page.getByRole('button',{name:'调整时长 快捷验收'}),block=page.locator('button.time-block').filter({hasText:'快捷验收'});
 await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();
 const x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+84,{steps:5});
 await expect(page.locator('.time-resize-feedback')).toContainText('75 分钟');
 await expect(page.locator('.time-resize-feedback')).toHaveAttribute('data-conflict','true');
 await page.screenshot({path:'test-results/timeline-resize-feedback.png',animations:'disabled'});
 await handle.dispatchEvent('pointercancel');await page.mouse.up();
 await expect(page.locator('.time-resize-feedback')).toHaveCount(0);
 await expect(block).toHaveAttribute('aria-label',/09:00–09:30/);
});
