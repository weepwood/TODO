import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
// Exercise the real first-use default rather than the edit-mode fixture used
// by legacy control-level suites.
test.use({storageState:{cookies:[],origins:[]}});
async function seed(page){
 const state=initialState(),today=dayKey();
 state.tags=[{id:'tag-demo',name:'学习',color:'#8056c4'}];
 state.tasks=[{...newTask('分区验收','inbox',today),notes:'项目说明',tags:['tag-demo'],duration:30,points:5,checklist:[{id:'check-demo',text:'检查事项',done:false}]}];
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(data))},state);
 await page.goto('/');await page.locator('.task-body').filter({hasText:'分区验收'}).click();
}
test('默认七区展示态，独立编辑、全局编辑与持久化',async({page})=>{
 await page.setViewportSize({width:1520,height:1000});await seed(page);
 const detail=page.locator('.detail-content'),cards=detail.locator('.detail-section-card'),plan=detail.locator('[data-detail-section=plan]');
 await expect(cards).toHaveCount(7);
 await expect(detail.getByRole('spinbutton',{name:'预计分钟'})).toHaveCount(0);
 await expect(plan).toContainText('30 分钟');
 await expect(detail.locator('[data-detail-section=notes]')).toContainText('#学习');
 await expect(detail.locator('[data-detail-section=notes]')).toContainText('项目说明');
 expect(await plan.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
 await page.screenshot({path:'test-results/detail-sections-overview.png',animations:'disabled'});
 await plan.getByRole('button',{name:'编辑 时间与计划',exact:true}).click();
 const duration=plan.getByRole('spinbutton',{name:'预计分钟'});
 await duration.fill('45');await duration.press('Enter');
 await expect(detail.locator('[data-detail-section=organization]')).toHaveAttribute('data-editing','false');
 await plan.getByRole('button',{name:'完成编辑 时间与计划'}).click();
 await expect(plan).toContainText('45 分钟');
 await expect(duration).toHaveCount(0);
 await detail.getByRole('button',{name:'编辑全部',exact:true}).click();
 await expect(detail.locator('.detail-section-card[data-editing=true]')).toHaveCount(6);
 await expect(detail.getByRole('textbox',{name:'任务备注'})).toHaveValue('项目说明');
 await page.screenshot({path:'test-results/detail-sections-edit.png',animations:'disabled'});
 await detail.getByRole('button',{name:'完成全部编辑'}).click();
 await page.reload();await page.locator('.task-body').filter({hasText:'分区验收'}).click();
 await expect(plan).toContainText('45 分钟');
 await expect(duration).toHaveCount(0);
});
test('移动端分区导航、提醒草稿取消与历史展开',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page);
 const detail=page.locator('.detail-content'),nav=detail.getByRole('navigation',{name:'任务详情分区'});
 await nav.getByRole('button',{name:'提醒',exact:true}).click();
 const reminders=detail.locator('[data-detail-section=reminders]');
 await expect(reminders.getByRole('button',{name:'编辑 提醒与重复'})).toBeInViewport();
 await reminders.getByRole('button',{name:'编辑 提醒与重复'}).click();
 await reminders.getByRole('button',{name:'独立提醒',exact:true}).click();
 await page.getByRole('dialog',{name:'独立提醒编辑',exact:true}).getByRole('button',{name:'取消',exact:true}).click();
 await reminders.getByRole('button',{name:'完成编辑 提醒与重复'}).click();
 await expect(reminders).toContainText('未设置');
 await nav.getByRole('button',{name:'附件',exact:true}).click();
 await expect(detail.locator('[data-detail-section=resources]')).toContainText('暂无附件');
 await nav.getByRole('button',{name:'记录',exact:true}).click();
 await detail.getByRole('button',{name:'查看全部历史'}).click();
 await expect(detail.getByRole('heading',{name:'活动记录',exact:true})).toBeVisible();
 await expect(detail.locator('.detail-history-summary')).toBeHidden();
 expect(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:'test-results/detail-sections-mobile.png',animations:'disabled'});
});
