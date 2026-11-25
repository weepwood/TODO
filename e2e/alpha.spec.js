import {chooseOption} from './select-helper.js';
import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
test('详情关闭动画可中断，焦点与新任务保持正确',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
 for(const title of ['原详情','新详情']){await page.getByRole('textbox',{name:'新任务名称'}).fill(title);await page.getByRole('button',{name:'添加',exact:true}).click()}
 await page.locator('.task-body').filter({hasText:'原详情'}).click();await page.getByRole('button',{name:'关闭详情'}).click();
 await page.locator('.task-body').filter({hasText:'新详情'}).click();await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('新详情');await page.waitForTimeout(180);await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('新详情');
 await page.getByRole('button',{name:'关闭详情'}).click();await expect(page.locator('.details')).toHaveCount(0);await expect(page.locator('.task-body').filter({hasText:'新详情'})).toBeFocused();
});
test('看板概览、习惯空状态及区间统计口径',async({page})=>{
 const today=dayKey(),state=initialState();state.tasks=[{...newTask('正在处理'),stage:'doing'},{...newTask('已完成'),status:'completed',completedAt:new Date(today+'T12:00:00').toISOString()}];state.habits=[{id:'h',name:'阅读',days:[today,shiftDay(today,-40)],weeklyGoal:7}];
 await page.addInitScript(data=>localStorage.setItem('todo-workbench-v1',JSON.stringify(data)),state);await page.goto('/');
 await page.locator('.rail').getByRole('button',{name:'看板',exact:true}).click();await expect(page.locator('.module-summary')).toContainText('1 进行中');await expect(page.locator('.module-summary')).toContainText('1 累计完成');
 await page.locator('.rail').getByRole('button',{name:'习惯',exact:true}).click();await expect(page.locator('.module-summary')).toContainText('1/1 今日打卡');
 await page.locator('.rail').getByRole('button',{name:'统计',exact:true}).click();await expect(page.locator('.stat-grid>div').filter({hasText:'区间习惯打卡（全部）'})).toContainText('1');
 await chooseOption(page.locator('.stats-toolbar .smart-select-trigger').first(),'90');await expect(page.locator('.stat-grid>div').filter({hasText:'区间习惯打卡（全部）'})).toContainText('2');
});
