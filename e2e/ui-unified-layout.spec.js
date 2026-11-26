import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
test.use({reducedMotion:'reduce'});
for(const [theme,density,height,rowHeight] of [['light','compact',32,42],['dark','regular',36,48],['dark','relaxed',40,56]])test('公共界面尺寸和弹层 '+theme+' '+density,async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 const d=initialState();d.theme=theme;d.tasks=[{...newTask('统一布局任务','inbox',dayKey(),'a'),notes:'备注与属性',duration:30,checklist:[{id:'check',text:'验证检查项',done:false}]}];
 await page.addInitScript(({d,density})=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d));localStorage.setItem('todo-appearance-v1',JSON.stringify({density,font:'normal',accent:'blue'}))},{d,density});
 await page.goto('/');await page.locator('.task-body').filter({hasText:'统一布局任务'}).click();
 const detail=page.locator('.detail-content'),row=page.locator('.task-row').first();await expect(row).toHaveCSS('min-height',rowHeight+'px');await expect(row).toHaveCSS('padding-left','13px');
 const gap=await row.evaluate(e=>e.querySelector('.task-check').getBoundingClientRect().left-e.getBoundingClientRect().left);expect(gap).toBeGreaterThanOrEqual(12);
 const number=detail.locator('[data-detail-section=plan] .number-control').first();await expect(number).toHaveCSS('height',height+'px');
 await expect(detail.locator('[data-detail-section=plan] .property-value').first()).toHaveCSS('min-height',height+'px');
 mkdirSync('test-results/ui-unified',{recursive:true});await page.screenshot({path:'test-results/ui-unified/'+theme+'-'+density+'-detail.png',animations:'disabled'});
 await detail.getByRole('button',{name:'提醒',exact:true}).click();const popup=page.getByRole('dialog',{name:'提醒设置',exact:true});await expect(popup).toBeVisible();await expect(popup.getByRole('button',{name:'确定',exact:true})).toHaveCSS('min-height',height+'px');await page.screenshot({path:'test-results/ui-unified/'+theme+'-'+density+'-popup.png',animations:'disabled'});await popup.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'新建标签',exact:true}).click();const modal=page.getByRole('dialog',{name:'新建标签'});await expect(modal.getByRole('button',{name:'保存',exact:true})).toHaveCSS('min-height',height+'px');await expect(modal.locator('.dialog-head h2')).toHaveCSS('font-size','18px');await page.screenshot({path:'test-results/ui-unified/'+theme+'-'+density+'-dialog.png',animations:'disabled'});await modal.getByRole('button',{name:'关闭',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('移动浮层操作按钮触控尺寸',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).fill('移动操作验收');await page.getByRole('button',{name:'添加',exact:true}).click();
 const detail=page.locator('.detail-content');await detail.getByRole('button',{name:'提醒',exact:true}).click();const popup=page.getByRole('dialog',{name:'提醒设置',exact:true});
 await expect(popup.getByRole('button',{name:'确定',exact:true})).toHaveCSS('min-height','44px');await expect(popup.getByRole('button',{name:'取消',exact:true})).toHaveCSS('min-height','44px');
 await page.screenshot({path:'test-results/ui-unified/mobile-popup.png',animations:'disabled'});await popup.getByRole('button',{name:'取消',exact:true}).click();
});
