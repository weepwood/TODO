import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
for(const landscape of [false,true])test('搜索键盘、边界与快速重开 '+landscape,async({page,browserName})=>{
 await page.setViewportSize(landscape?{width:812,height:375}:{width:1440,height:900});
 await page.emulateMedia({reducedMotion:'reduce',...(browserName==='chromium'?{forcedColors:'active'}:{})});
 const d=initialState();d.theme=landscape?'dark':'light';d.tasks=Array.from({length:90},(_,i)=>newTask('验收任务 '+String(i).padStart(2,'0'),'inbox',dayKey()));
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.goto('/');const trigger=page.getByRole('button',{name:'全局搜索',exact:true});await trigger.click();
 const input=page.getByRole('combobox',{name:'搜索命令与任务'});await expect(input).toBeFocused();await input.fill('验收任务');
 const dialog=page.getByRole('dialog',{name:'命令面板'}),results=dialog.getByRole('listbox');await expect(results.getByRole('option')).toHaveCount(60);
 await input.press('End');await expect(results.getByRole('option').last()).toHaveAttribute('aria-selected','true');
 expect(await results.evaluate(e=>e.scrollHeight>e.clientHeight&&e.clientHeight>30)).toBe(true);
 const b=await dialog.boundingBox();expect(b.y).toBeGreaterThanOrEqual(0);expect(b.y+b.height).toBeLessThanOrEqual((await page.viewportSize()).height+1);
 const footer=await dialog.locator('.palette-footer').boundingBox();expect(footer.y+footer.height).toBeLessThanOrEqual(b.y+b.height+1);
 mkdirSync('test-results/final-closeout',{recursive:true});await page.screenshot({path:`test-results/final-closeout/search-${browserName}-${landscape}.png`,animations:'disabled'});
 await input.fill('没有匹配的字符串');await expect(dialog.getByRole('status')).toContainText('没有匹配结果');await input.press('Escape');await expect(dialog).toHaveCount(0);
 await trigger.click();await expect(input).toBeFocused();await input.fill('验收任务 42');await input.press('Enter');await expect(dialog).toHaveCount(0);await expect(page.getByRole('complementary',{name:'任务详情'})).toContainText('验收任务 42');
});
