import {chooseOption} from './select-helper.js';
import {test,expect} from '@playwright/test';
test('外观设置持久化及日历、每日规划日期双向联动',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'外观与布局',exact:true}).click();await page.getByRole('button',{name:'松石主题色'}).click();
 await chooseOption(page.getByRole('combobox',{name:'控件密度'}),'relaxed');await chooseOption(page.getByRole('combobox',{name:'文字大小'}),'large');
 await expect(page.locator('html')).toHaveAttribute('data-accent','teal');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-density','relaxed');await expect(page.locator('html')).toHaveAttribute('data-font','large');
 await page.getByRole('button',{name:'每日规划',exact:true}).click();await page.getByLabel('规划日期').fill('2026-12-01');await page.getByRole('button',{name:'查看日历'}).click();
 await expect(page.getByLabel('联动日期')).toHaveValue('2026-12-01');await page.getByLabel('联动日期').fill('2026-12-05');await page.getByRole('button',{name:'查看每日规划'}).click();await expect(page.getByLabel('规划日期')).toHaveValue('2026-12-05');
 expect(errors).toEqual([]);
});
test('可视化任务列表及表格编辑保存为 Markdown',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).fill('编辑器扩展');await page.getByRole('button',{name:'添加',exact:true}).click();
 await page.getByRole('textbox',{name:'任务备注'}).fill('计划');await page.getByRole('button',{name:'展开编辑'}).click();
 const d=page.getByRole('dialog',{name:'备注编辑工作台'});await d.getByRole('button',{name:'可视化编辑',exact:true}).click();const editor=d.getByRole('textbox',{name:'可视化备注编辑器'});await expect(editor).toBeVisible();
 await editor.click();await d.getByRole('button',{name:'任务列表',exact:true}).click();await expect(editor.locator('ul[data-type=taskList]')).toBeVisible();
 await d.getByRole('button',{name:'返回源码'}).click();await expect(d.getByRole('textbox',{name:'工作台备注源码'})).toHaveValue(/- \[ \] 计划/);
 await d.getByRole('textbox',{name:'工作台备注源码'}).fill('表格');await d.getByRole('button',{name:'可视化编辑',exact:true}).click();await expect(editor).toBeVisible();await editor.click();
 await d.getByRole('button',{name:'插入表格'}).click();await expect(editor.locator('table')).toBeVisible();
 await d.getByRole('button',{name:'返回源码'}).click();await expect(d.getByRole('textbox',{name:'工作台备注源码'})).toHaveValue(/\|.*\|/);
 expect(errors).toEqual([]);
});
