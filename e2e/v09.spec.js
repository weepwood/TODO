import {test,expect} from '@playwright/test';
test('日历任务栏筛选、安排与选定日期联动',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('button',{name:'新建任务',exact:true}).click();
 await page.getByRole('textbox',{name:'快速任务名称'}).fill('未安排事项');await page.getByRole('button',{name:'创建任务',exact:true}).click();
 await page.getByRole('button',{name:'日历',exact:true}).click();await page.getByLabel('联动日期').fill('2026-12-10');
 const agenda=page.getByRole('complementary',{name:'日历任务栏'});await agenda.getByRole('button',{name:'待安排',exact:true}).click();
 await agenda.getByRole('textbox',{name:'日历任务搜索'}).fill('未安排事项');await agenda.getByRole('button',{name:'安排 未安排事项'}).click();
 await agenda.getByRole('button',{name:'选定日期',exact:true}).click();await expect(agenda.getByRole('button',{name:/未安排事项/})).toBeVisible();
 await page.getByRole('button',{name:'隐藏任务栏'}).click();await expect(agenda).toHaveCount(0);await page.getByRole('button',{name:'显示任务栏'}).click();await expect(agenda).toBeVisible();expect(errors).toEqual([]);
});
test('独立移动把手支持键盘及指针移动',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'新任务名称'}).fill('移动块 今天 09:00');await page.getByRole('button',{name:'添加',exact:true}).click();await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const handle=page.getByRole('button',{name:'移动时间 移动块'}),block=page.locator('button.time-block').filter({hasText:'移动块'});
 await handle.focus();await page.keyboard.press('ArrowDown');await expect(block).toHaveAttribute('aria-label',/09:15–09:45/);
 const box=await handle.boundingBox();await page.mouse.move(box.x+5,box.y+5);await page.mouse.down();await page.mouse.move(box.x+5,box.y+33,{steps:5});await page.mouse.up();await expect(block).toHaveAttribute('aria-label',/09:45–10:15/);
});
