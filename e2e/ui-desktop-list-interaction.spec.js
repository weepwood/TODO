import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
async function seed(page){
 const state=initialState();
 state.tasks=['任务3','任务1','任务2','任务4'].map(title=>newTask(title,'inbox',dayKey()));
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(data))},state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');
 await page.locator('[data-view-key=inbox]').click();
}
test('桌面无复选框，Shift范围与Ctrl非连续选择，单击清空批量状态',async({page})=>{
 await seed(page);
 const rows=page.locator('.task-row'),body=i=>rows.nth(i).locator('.task-body');
 await expect(rows.locator('.multi-toggle')).toHaveCount(0);
 await body(0).click();await body(2).click({modifiers:['Shift']});
 await expect(page.locator('.task-row.checked')).toHaveCount(3);
 await body(1).click({modifiers:['Control']});
 await expect(page.locator('.task-row.checked')).toHaveCount(2);
 await body(3).click({modifiers:['Meta']});
 await expect(page.locator('.task-row.checked')).toHaveCount(3);
 await page.screenshot({path:'test-results/desktop-multiselect.png',animations:'disabled'});
 await body(0).click();await expect(page.locator('.task-row.checked')).toHaveCount(0);
 await expect(page.locator('.bulk-bar')).toBeHidden();
});
test('浮动手柄在卡片之外且实际手动拖动，二级菜单排序分组顺序',async({page})=>{
 await seed(page);
 const rows=page.locator('.task-row'),row=rows.first(),handle=row.locator('.drag-handle');
 await row.hover();await expect(handle).toHaveCSS('opacity','1');
 const a=await handle.boundingBox(),b=await row.boundingBox(),target=await rows.nth(2).boundingBox();
 expect(a.x+a.width).toBeLessThanOrEqual(b.x+1);
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
 await expect(handle).toHaveCSS('opacity','1');await expect(handle).toHaveCSS('cursor','grab');
 await page.screenshot({path:'test-results/desktop-floating-drag.png',animations:'disabled'});
 await page.mouse.down();await page.mouse.move(target.x+20,target.y+target.height-4,{steps:15});await page.mouse.up();
 await expect(rows.nth(2).locator('.task-body')).toContainText('任务3');
 const menu=page.getByRole('button',{name:'分组、排序与顺序'});
 const choose=async(label,value)=>{await menu.click();await page.getByRole('menuitem',{name:new RegExp('^'+label)}).hover();await page.getByRole('menuitemradio',{name:value,exact:true}).click()};
 await menu.click();await expect(page.getByRole('menuitem',{name:/^顺序/})).toHaveAttribute('aria-disabled','true');
 await page.screenshot({path:'test-results/desktop-view-menu.png',animations:'disabled'});
 await page.keyboard.press('Escape');
 await choose('排序','标题');await expect(rows.first().locator('.task-body')).toContainText('任务1');
 await expect(rows.locator('.drag-handle')).toHaveCount(0);
 await choose('顺序','降序');await expect(rows.first().locator('.task-body')).toContainText('任务4');
 await choose('分组','清单');await expect(page.locator('.list-caption')).toContainText('收集箱');
});
