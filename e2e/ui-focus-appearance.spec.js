import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
async function seed(page){
 const state=initialState();state.tasks=[newTask('焦点测试','inbox',dayKey())];
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1')){localStorage.setItem('todo-workbench-v1',JSON.stringify(data));localStorage.setItem('todo-appearance-v1',JSON.stringify({accent:'violet',density:'regular',font:'normal'}))}},state);
 await page.goto('/');
}
async function settings(page){
 await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'外观与布局'}).click();
 return page.getByRole('switch',{name:'增强焦点描边'});
}
async function closeSettings(page){await page.getByRole('dialog',{name:'设置与数据管理'}).getByRole('button',{name:'关闭',exact:true}).click()}
test('默认简洁焦点，鼠标输入无重复描边而键盘保留提示',async({page})=>{
 await seed(page);
 await expect(page.locator('html')).toHaveAttribute('data-focus-mode','quiet');
 const quick=page.getByRole('textbox',{name:'新任务名称'});
 await quick.click();
 await expect(quick).toHaveCSS('outline-style','none');
 await expect(page.locator('.quick-add')).toHaveCSS('box-shadow','none');
 await page.screenshot({path:'test-results/focus-quiet.png',animations:'disabled'});
 await page.keyboard.press('Tab');
 await expect(page.locator('html')).toHaveAttribute('data-input-modality','keyboard');
 const focused=page.locator(':focus');
 await expect(focused).toHaveCSS('outline-style','solid');
 await page.locator('.task-body').filter({hasText:'焦点测试'}).click();
 await expect(page.locator('.task-row.selected')).toHaveCSS('outline-style','none');
 const time=page.getByRole('textbox',{name:'计划时间',exact:true});
 await time.click();
 await expect(time).toHaveCSS('outline-style','none');
 await time.fill('10:30');await time.blur();await expect(time).toHaveValue('10:30');
 await page.getByRole('button',{name:'全局搜索',exact:true}).click();
 const search=page.getByRole('combobox',{name:'搜索命令与任务'});
 await expect(search).toBeFocused();
 await expect(page.locator('.palette-search')).toHaveCSS('box-shadow','none');
 await search.fill('焦点测试');await expect(page.getByRole('option').filter({hasText:'焦点测试'})).toBeVisible();
});
test('增强焦点开关生效、重载保留、恢复默认并兼容强制颜色',async({page})=>{
 await seed(page);
 const sw=await settings(page);await expect(sw).toHaveAttribute('aria-checked','false');
 await sw.click();await expect(sw).toHaveAttribute('aria-checked','true');
 await expect(page.locator('html')).toHaveAttribute('data-focus-mode','enhanced');
 await page.screenshot({path:'test-results/focus-setting.png',animations:'disabled'});
 await closeSettings(page);
 await page.getByRole('textbox',{name:'新任务名称'}).click();
 await expect(page.locator('.quick-add')).not.toHaveCSS('box-shadow','none');
 await page.screenshot({path:'test-results/focus-enhanced.png',animations:'disabled'});
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-focus-mode','enhanced');
 await settings(page);await expect(sw).toHaveAttribute('aria-checked','true');
 await page.getByRole('button',{name:'恢复默认外观',exact:true}).click();
 await expect(sw).toHaveAttribute('aria-checked','false');
 await closeSettings(page);
 await page.emulateMedia({forcedColors:'active'});
 await page.keyboard.press('Tab');
 await expect(page.locator(':focus')).toHaveCSS('outline-style','solid');
 await expect(page.locator('html')).toHaveAttribute('data-focus-mode','quiet');
});
