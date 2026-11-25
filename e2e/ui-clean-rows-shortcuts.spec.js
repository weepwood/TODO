import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
async function seed(page){
 const state=initialState();state.tasks=['快捷键验收','第二项'].map(t=>newTask(t,'inbox',dayKey()));
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(data))},state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.locator('[data-view-key=inbox]').click();
}
test('任务辅助控件仅悬浮或选择时显示，未选导航无标记',async({page})=>{
 await seed(page);
 const row=page.locator('.task-row').first(),nav=page.locator('[data-view-key=today]');
 await page.mouse.move(0,0);
 await expect(row.locator('.multi-toggle')).toHaveCount(0);
 await expect(row.locator('.drag-handle')).toHaveCSS('opacity','0');
 await expect.poll(()=>nav.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('0');
 const active=page.locator('[data-view-key=inbox]');
 await expect.poll(()=>active.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('1');
 await nav.hover();await expect.poll(()=>nav.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('0');
 await row.hover();await expect(row.locator('.drag-handle')).toHaveCSS('opacity','1');
 const handle=await row.locator('.drag-handle').boundingBox(),box=await row.boundingBox();
 expect(handle.x+handle.width).toBeLessThanOrEqual(box.x+1);
 await page.mouse.move(0,0);await expect(row.locator('.drag-handle')).toHaveCSS('opacity','0');
 await row.locator('.task-body').click();await page.locator('.task-row').nth(1).locator('.task-body').click({modifiers:['Shift']});
 await expect(page.locator('.bulk-bar')).toContainText('已选 2 项');
 await page.getByRole('button',{name:'结束选择',exact:true}).click();
 await expect(page.locator('.bulk-bar')).toBeHidden();
 await expect(page.locator('.task-shortcuts')).toHaveCount(0);
 await page.screenshot({path:'test-results/clean-rows.png',animations:'disabled'});
});
test('设置改键冲突拦截、实际执行、重载和恢复默认',async({page})=>{
 await seed(page);
 const open=async()=>{await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'快捷键',exact:true}).click()};
 await open();
 const key=page.getByRole('button',{name:'编辑快捷键 安排明天',exact:true});
 await key.click();await page.keyboard.press('t');
 await expect(page.getByRole('alert')).toContainText('冲突');
 await page.keyboard.press('j');await expect(key).toHaveText('J');
 await page.screenshot({path:'test-results/shortcut-settings.png',animations:'disabled'});
 await page.getByRole('dialog',{name:'设置与数据管理'}).getByRole('button',{name:'关闭',exact:true}).click();
 await page.reload();await page.locator('[data-view-key=inbox]').click();await open();await expect(key).toHaveText('J');
 await page.getByRole('dialog',{name:'设置与数据管理'}).getByRole('button',{name:'关闭',exact:true}).click();
 const body=page.locator('.task-body').filter({hasText:'快捷键验收'});
 await body.focus();await page.keyboard.press('j');
 await expect(body.locator('xpath=..').locator('.task-date')).toHaveText(shiftDay(dayKey(),1).slice(5));
 await open();await page.getByRole('button',{name:'恢复默认快捷键'}).click();await expect(key).toHaveText('M');
});
