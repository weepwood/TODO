import {test,expect} from '@playwright/test';
import {chooseOption} from './select-helper.js';
import {initialState,newTask,dayKey} from '../src/domain.js';
async function seed(page){
 const state=initialState(),today=dayKey();
 state.tasks=[{...newTask('工作任务','inbox',today),priority:2},{...newTask('待安排任务','inbox',''),priority:0}];
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(data))},state);
 await page.goto('/');
}
test('移动详情分区导航保持全部编辑功能',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page);
 await page.locator('.task-body').filter({hasText:'工作任务'}).click();
 const nav=page.getByRole('navigation',{name:'任务详情分区'});
 await expect(nav).toBeVisible();await nav.getByRole('button',{name:'计划',exact:true}).click();
 await expect(page.locator('[data-detail-section=plan]').getByRole('button',{name:'提醒',exact:true})).toBeInViewport();
 await nav.getByRole('button',{name:'备注',exact:true}).click();
 await expect(page.getByRole('button',{name:'展开编辑'})).toBeInViewport();
 await page.screenshot({path:'test-results/business-mobile-detail.png',animations:'disabled'});
 await nav.getByRole('button',{name:'计划',exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'预计分钟'})).toBeInViewport();
});
test('看板筛选及四象限非拖拽移动保留任务',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'看板',exact:true}).click();
 await chooseOption(page.getByRole('combobox',{name:'状态 工作任务',exact:true}),'doing');
 await page.getByRole('navigation',{name:'看板筛选'}).getByRole('button',{name:'进行中',exact:true}).click();
 await expect(page.locator('.board-column:visible')).toHaveCount(1);
 await expect(page.locator('.board-column:visible')).toContainText('工作任务');
 await page.getByRole('button',{name:'四象限',exact:true}).click();
 await chooseOption(page.getByRole('combobox',{name:'象限 工作任务',exact:true}),'important');
 await page.getByRole('navigation',{name:'四象限筛选'}).getByRole('button',{name:'重要不紧急',exact:true}).click();
 await expect(page.locator('.board-column:visible')).toContainText('工作任务');
 await page.screenshot({path:'test-results/business-matrix.png',animations:'disabled'});
 await page.reload();await page.getByRole('button',{name:'四象限',exact:true}).click();
 await expect(page.locator('[data-lane-key=important]')).toContainText('工作任务');
});
test('时间轴缩放按钮与原密度设置同步并保持',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const density=page.getByRole('combobox',{name:'时间轴密度',exact:true});
 await chooseOption(density,'56');
 await expect(page.getByRole('button',{name:'缩小时间轴'})).toBeDisabled();
 await page.getByRole('button',{name:'放大时间轴'}).click();await expect(density).toHaveAttribute('data-value','80');
 await page.getByRole('button',{name:'放大时间轴'}).click();await expect(density).toHaveAttribute('data-value','112');
 await expect(page.getByRole('button',{name:'放大时间轴'})).toBeDisabled();
 await page.reload();await page.getByRole('button',{name:'每日规划',exact:true}).click();
 await expect(density).toHaveAttribute('data-value','112');
});
test('手机习惯打卡及专注主操作可用',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page);
 await page.getByRole('button',{name:'更多',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'习惯',exact:true}).click();
 await page.getByPlaceholder('添加每日习惯').fill('每日阅读');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 const check=page.getByRole('button',{name:dayKey()+' 每日阅读',exact:true});
 await check.click();await expect(check).toHaveAttribute('aria-pressed','true');
 expect((await check.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:'test-results/business-mobile-habits.png',animations:'disabled'});
 await page.getByRole('button',{name:'更多',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'专注',exact:true}).click();
 await page.getByRole('button',{name:'开始',exact:true}).click();
 await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'暂停',exact:true}).click();
 await expect(page.getByRole('button',{name:'继续',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/business-mobile-focus.png',animations:'disabled'});
});
