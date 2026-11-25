import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';

async function seed(page){
 const state=initialState(),today=dayKey();
 state.tasks=[newTask('今日任务','inbox',today),newTask('待安排一','inbox',''),newTask('待安排二','inbox',''),{...newTask('积分记录','inbox',today),status:'completed',completedAt:new Date(today+'T12:00:00').toISOString(),points:20}];
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(data))},state);
 await page.goto('/');
}
const marker=el=>el.evaluate(e=>parseFloat(getComputedStyle(e,'::after').width));
test('日历和看板分段控件统一短指示器与间距',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 await page.getByRole('button',{name:'日历',exact:true}).click();
 const nav=page.getByRole('group',{name:'日历任务范围'}),day=nav.getByRole('button',{name:'选定日期'}),backlog=nav.getByRole('button',{name:'待安排',exact:true});
 await expect.poll(()=>marker(day)).toBe(19);
 await backlog.click();await expect.poll(()=>marker(backlog)).toBe(19);await expect.poll(()=>marker(day)).toBe(5);
 const rows=page.locator('.agenda-task');await expect(rows).toHaveCount(2);
 const a=await rows.nth(0).boundingBox(),b=await rows.nth(1).boundingBox();
 expect(b.y-a.y-a.height).toBeGreaterThanOrEqual(3);
 expect(await rows.first().evaluate(el=>getComputedStyle(el).borderBottomWidth)).toBe('0px');
 await page.screenshot({path:'test-results/business-design-calendar.png',animations:'disabled'});
 await page.getByRole('button',{name:'看板',exact:true}).click();
 const lanes=page.getByRole('navigation',{name:'看板筛选'});
 await lanes.getByRole('button',{name:'待处理',exact:true}).click();
 await expect.poll(()=>marker(lanes.getByRole('button',{name:'待处理',exact:true}))).toBe(19);
 await expect(page.locator('.board-column:visible')).toHaveCount(1);
 await page.screenshot({path:'test-results/business-design-board.png',animations:'disabled'});
});
test('移动规划与统计空间和控件一致且保持筛选',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page);
 await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'规划工作区'});
 await nav.getByRole('button',{name:/待安排任务/}).click();
 await expect.poll(()=>marker(nav.getByRole('button',{name:/待安排任务/}))).toBe(19);
 await expect(page.locator('.planner .unscheduled')).toContainText('待安排一');
 await page.screenshot({path:'test-results/business-design-planner.png',animations:'disabled'});
 await page.getByRole('button',{name:'统计',exact:true}).click();
 const filters=page.locator('.stats-filter-group');
 await expect(filters.getByRole('combobox',{name:'统计清单'})).toBeVisible();
 expect(await filters.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await expect(page.locator('.points-ledger')).toContainText('积分记录');
 await page.getByRole('textbox',{name:'搜索积分明细'}).fill('不存在');
 await expect(page.locator('.points-ledger')).toContainText('暂无匹配');
 await page.getByRole('textbox',{name:'搜索积分明细'}).fill('');
 await expect(page.locator('.points-ledger')).toContainText('积分记录');
 await page.screenshot({path:'test-results/business-design-stats.png',animations:'disabled'});
});
