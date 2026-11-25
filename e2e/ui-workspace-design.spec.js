import {test,expect} from '@playwright/test';
import {chooseOption} from './select-helper.js';
import {initialState,newTask,dayKey} from '../src/domain.js';
async function seed(page){
 const state=initialState(),today=dayKey();
 state.tasks=[{...newTask('时间规划验收','inbox',today),time:'09:00',duration:30,priority:2},{...newTask('工作中','inbox',today),stage:'doing'},{...newTask('完成记录','inbox',today),status:'completed',completedAt:new Date(today+'T12:00:00').toISOString()}];
 state.habits=[{id:'habit-sample',name:'每日阅读',days:[],weeklyGoal:3}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);
 await page.goto('/');
}
test('业务工作区指标、操作区、状态选择及专注数值真实可见',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 await page.getByRole('button',{name:'看板',exact:true}).click();
 await expect(page.locator('.module-summary')).toContainText('2 未完成任务');
 await expect(page.locator('.module-summary')).toContainText('1 进行中');
 const status=page.getByRole('combobox',{name:'状态 时间规划验收'});
 await chooseOption(status,'doing');await expect(page.locator('[data-lane-key=doing]')).toContainText('时间规划验收');
 await page.screenshot({path:'test-results/workspace-board-refined.png',animations:'disabled'});
 await page.getByRole('button',{name:'日历',exact:true}).click();
 await expect(page.locator('.calendar-info.workspace-actions')).toBeVisible();
 await page.getByRole('button',{name:'每日规划',exact:true}).click();
 await expect(page.locator('.planner-overview.metric-cards>div')).toHaveCount(4);
 await expect(page.locator('.planner-overview')).toContainText('30 分钟');
 await page.getByRole('button',{name:'专注',exact:true}).click();
 const minutes=page.getByRole('spinbutton',{name:'专注分钟',exact:true});
 await expect(minutes).toHaveValue('25');expect((await minutes.boundingBox()).width).toBeGreaterThan(32);
 await minutes.fill('35');await minutes.press('Enter');await expect(page.locator('.timer-ring strong')).toHaveText('00:35:00');
 await page.screenshot({path:'test-results/workspace-focus-refined.png',animations:'disabled'});
 await page.getByRole('button',{name:'习惯',exact:true}).click();
 const progress=page.locator('.habit-progress progress');
 await expect(progress).toHaveAttribute('max','3');await expect(progress).toHaveAttribute('value','0');
 await page.getByRole('button',{name:dayKey()+' 每日阅读',exact:true}).click();await expect(progress).toHaveAttribute('value','1');
 await page.screenshot({path:'test-results/workspace-habits-refined.png',animations:'disabled'});
 await page.getByRole('button',{name:'统计',exact:true}).click();
 await expect(page.locator('.stat-grid.metric-cards>div')).toHaveCount(4);
 await expect(page.locator('.stat-grid.metric-cards>div').filter({hasText:'区间习惯打卡（全部）'})).toContainText('1');
 await page.screenshot({path:'test-results/workspace-stats-refined.png',animations:'disabled'});
});
test('窄屏专注控件和习惯进度保留触控尺寸',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page);
 const more=async name=>{await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name,exact:true}).click()};
 await more('专注');
 const minutes=page.getByRole('spinbutton',{name:'专注分钟',exact:true});await expect(minutes).toHaveValue('25');expect((await minutes.boundingBox()).width).toBeGreaterThan(32);
 expect((await page.getByRole('button',{name:'专注分钟增加'}).boundingBox()).height).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:'test-results/workspace-focus-mobile-refined.png',animations:'disabled'});
 await more('习惯');await expect(page.locator('.habit-progress progress')).toHaveAttribute('max','3');
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
