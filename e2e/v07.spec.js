import {chooseOption} from './select-helper.js';
import {test,expect} from '@playwright/test';
test('富文本可视化编辑保留 Markdown，复杂源文拒绝转换',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).fill('可视编辑');await page.getByRole('button',{name:'添加',exact:true}).click();
 await page.getByRole('textbox',{name:'任务备注'}).fill('普通文本');
 await page.getByRole('button',{name:'展开编辑'}).click();const dialog=page.getByRole('dialog',{name:'备注编辑工作台'});
 await dialog.getByRole('button',{name:'可视化编辑',exact:true}).click();
 const editor=dialog.getByRole('textbox',{name:'可视化备注编辑器'});await expect(editor).toBeVisible();
 await editor.click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('New paragraph');
 await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await dialog.getByRole('button',{name:'粗体',exact:true}).click();await expect(editor.locator('strong')).toHaveText('New paragraph');
 await dialog.getByRole('button',{name:'返回源码'}).click();await expect(dialog.getByRole('textbox',{name:'工作台备注源码'})).toHaveValue(/\*\*New paragraph\*\*/);
 await dialog.getByRole('button',{name:'应用备注'}).click();await expect(page.getByRole('textbox',{name:'任务备注'})).toHaveValue(/\*\*New paragraph\*\*/);
 await page.getByRole('textbox',{name:'任务备注'}).fill('![image](https://example.invalid/img.png)');
 await page.getByRole('button',{name:'展开编辑'}).click();await dialog.getByRole('button',{name:'可视化编辑',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('为保护原始内容');
 await dialog.getByRole('button',{name:'返回源码'}).click();await expect(dialog.getByRole('textbox',{name:'工作台备注源码'})).toHaveValue('![image](https://example.invalid/img.png)');
 expect(errors).toEqual([]);
});
test('时间块时长键盘调整、真实指针拉伸及密度切换',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'新任务名称'}).fill('拉伸任务 今天 09:00');await page.getByRole('button',{name:'添加',exact:true}).click();await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const block=page.locator('button.time-block').filter({hasText:'拉伸任务'}),handle=page.getByRole('button',{name:'调整时长 拉伸任务'});
 await expect(block).toHaveAttribute('aria-label',/09:00–09:30/);await handle.focus();await page.keyboard.press('ArrowDown');await expect(block).toHaveAttribute('aria-label',/09:00–09:45/);
 await chooseOption(page.getByRole('combobox',{name:'时间轴密度'}),'112');const rect=await handle.boundingBox();
 await page.mouse.move(rect.x+rect.width/2,rect.y+3);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2,rect.y+31,{steps:5});await page.mouse.up();
 await expect(block).toHaveAttribute('aria-label',/09:00–10:00/);
 await page.screenshot({path:'test-results/v07-resize.png'});
});
