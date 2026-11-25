import {test,expect} from '@playwright/test';
import {chooseOption} from './select-helper.js';
import {initialState,newTask,dayKey} from '../src/domain.js';
test('看板跨列移动反馈及减少动效',async({page})=>{
 const data=initialState();data.tasks=[newTask('动画验收','inbox',dayKey())];
 await page.addInitScript(data=>{
  if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(data));
  const animate=Element.prototype.animate;window.__boardMoves=0;
  Element.prototype.animate=function(...args){if(this.matches('[data-board-task]')&&args[0]?.[0]?.translate)window.__boardMoves++;return animate.apply(this,args)};
 },data);
 await page.goto('/');await page.getByRole('button',{name:'看板',exact:true}).click();
 await chooseOption(page.getByRole('combobox',{name:'状态 动画验收',exact:true}),'doing');
 await expect(page.locator('[data-lane-key=doing]')).toContainText('动画验收');
 await expect.poll(()=>page.evaluate(()=>window.__boardMoves)).toBeGreaterThan(0);
 await page.emulateMedia({reducedMotion:'reduce'});
 const before=await page.evaluate(()=>window.__boardMoves);
 await chooseOption(page.getByRole('combobox',{name:'状态 动画验收',exact:true}),'todo');
 await expect(page.locator('[data-lane-key=todo]')).toContainText('动画验收');
 expect(await page.evaluate(()=>window.__boardMoves)).toBe(before);
 await page.screenshot({path:'test-results/visual-board.png',animations:'disabled'});
});
test('日历选中日期反馈及规划工具栏窄屏布局',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'日历',exact:true}).click();
 await page.getByLabel('联动日期',{exact:true}).fill('2026-12-12');
 await expect(page.locator('.calendar-main [data-date="2026-12-12"].todo-selected-day')).toBeVisible();
 await page.screenshot({path:'test-results/visual-mobile-calendar.png',animations:'disabled'});
 await page.getByRole('button',{name:'查看每日规划'}).click();
 await expect(page.getByLabel('规划日期',{exact:true})).toHaveValue('2026-12-12');
 expect(await page.locator('.planner-toolbar').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:'test-results/visual-mobile-planner.png',animations:'disabled'});
});
test('备注阅读模式保留未应用草稿及原始内容',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'新任务名称'}).fill('阅读模式验收');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 await page.getByRole('button',{name:'展开编辑'}).click();
 const dialog=page.getByRole('dialog',{name:'备注编辑工作台'});
 const source=dialog.getByRole('textbox',{name:'工作台备注源码'});
 await source.fill('# 任务说明\n\n**未应用草稿**');
 await expect(dialog.locator('.note-draft-status')).toContainText('未应用草稿');
 await dialog.getByRole('button',{name:'阅读模式',exact:true}).click();
 await expect(dialog.locator('.note-reading')).toContainText('任务说明');
 await expect(source).toHaveCount(0);
 await page.screenshot({path:'test-results/visual-note-reading.png',animations:'disabled'});
 await dialog.getByRole('button',{name:'返回编辑',exact:true}).click();
 await expect(source).toHaveValue('# 任务说明\n\n**未应用草稿**');
 await dialog.getByRole('button',{name:'应用备注'}).click();
 await expect(dialog).toHaveCount(0);
});
