import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,STORAGE_KEY} from '../src/domain.js';
const seed=async page=>{
 const d={...initialState(),tasks:[{...newTask('体验任务','inbox',dayKey(),'experience-task'),checklist:[{id:'check-experience',text:'检查项目',done:false}]}]};
 await page.addInitScript(({key,d})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(d))},{key:STORAGE_KEY,d});await page.goto('/');
};
test('今日低频入口收纳、空清单可发现、连续录入与撤销',async({page})=>{
 await seed(page);const sidebar=page.locator('.sidebar'),toolbar=page.locator('.view-toolbar').first();
 await expect(sidebar.getByRole('button',{name:'新建智能清单'})).toHaveCSS('opacity','1');
 await expect(sidebar.getByRole('button',{name:'新建标签'})).toHaveCSS('opacity','1');
 await expect(toolbar.getByRole('button',{name:'自动化工作台',exact:true})).toHaveCount(0);
 await toolbar.getByRole('button',{name:'今日更多操作'}).click();
 await page.getByRole('menuitem',{name:'自动化工作台',exact:true}).click();
 await expect(page.getByRole('region',{name:'任务工作流自动化'})).toBeVisible();
 await sidebar.locator('[data-view-key=today]').click();
 const input=page.getByRole('textbox',{name:'新任务名称'});await input.fill('连续录入一');await page.locator('.task-capture-toolbar .quick-add').getByRole('button',{name:'添加'}).click();await expect(input).toBeFocused();
 await input.fill('连续录入二');await input.press('Enter');await expect(input).toBeFocused();
 await expect(page.locator('.task-row').filter({hasText:'连续录入二'})).toBeVisible();
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect(page.locator('.task-row').filter({hasText:'连续录入二'})).toHaveCount(0);
 await page.getByRole('button',{name:'重做',exact:true}).click();await expect(page.locator('.task-row').filter({hasText:'连续录入二'})).toBeVisible();
});
test('移动端折叠详情保留摘要并从分区导航直接展开',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page);
 await page.locator('[data-row-id=experience-task] .task-body').click();
 const detail=page.locator('.detail-content'),checks=detail.locator('[data-detail-section=checklist]');
 await expect(checks).toBeVisible();await checks.getByRole('button',{name:'折叠检查清单'}).click();
 await expect(checks.locator('.detail-section-meta')).toContainText('0/1');
 await expect(checks.getByRole('checkbox',{name:'检查项目'})).toBeHidden();
 await detail.getByRole('navigation',{name:'任务详情分区'}).getByRole('button',{name:'检查',exact:true}).click();
 await expect(checks.getByRole('checkbox',{name:'检查项目'})).toBeVisible();await checks.getByRole('checkbox',{name:'检查项目'}).check();
 await expect(checks.locator('.detail-section-meta')).toContainText('1/1');
});
test('移动规划控件完整展示、统计区段跳转及习惯输入语义',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page);
 await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const bar=page.locator('.planner-mode-group');await expect(bar).toBeVisible();
 const geometry=await bar.evaluate(el=>[...el.children].map(x=>({name:x.textContent,sw:x.scrollWidth,cw:x.clientWidth,h:x.getBoundingClientRect().height})));
 expect(geometry.every(x=>x.sw<=x.cw+1&&x.h>=40),JSON.stringify(geometry)).toBe(true);
 await page.getByRole('combobox',{name:'智能规划范围'}).click();await page.getByRole('option',{name:'三日多段'}).click();await expect(page.getByRole('combobox',{name:'智能规划范围'})).toContainText('三日多段');
 await page.getByRole('button',{name:'查看日历',exact:true}).click();
 const calendar=page.locator('.calendar-main');
 for(const label of ['周','日','月']){await calendar.getByRole('tab',{name:label,exact:true}).click();await expect(calendar.getByRole('tab',{name:label,exact:true})).toHaveAttribute('aria-selected','true')}
 await expect(calendar.getByRole('button',{name:'今天',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'回到今天',exact:true}).click();await expect(page.getByRole('textbox',{name:'联动日期'})).toHaveValue(dayKey());
 await page.getByRole('button',{name:'统计',exact:true}).click();
 await page.getByRole('button',{name:'跳转到…'}).click();await page.getByRole('menuitem',{name:'任务积分',exact:true}).click();
 await expect(page.getByRole('heading',{name:'任务积分',exact:true})).toBeInViewport();
 await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name:'习惯',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'习惯名称'})).toBeVisible();
});

for(const width of [1440,390])test('录入优先于执行建议 '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await seed(page);
 const input=page.getByRole('textbox',{name:'新任务名称'}),panel=page.getByRole('region',{name:'今日执行'});
 await expect(input).toBeVisible();await expect(panel).toBeVisible();
 await panel.getByRole('button',{name:'展开执行清单'}).click();
 await expect(panel.locator('.today-execution-item').first()).toBeVisible();
 expect((await input.boundingBox()).y).toBeLessThan((await panel.boundingBox()).y);
 await input.fill('克制专项合成录入');await input.press('Enter');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks.some(t=>t.title==='克制专项合成录入'))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
