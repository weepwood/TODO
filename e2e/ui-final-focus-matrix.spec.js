import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
test('详情退出期间打开新浮层不会夺取焦点',async({page})=>{
 const d=initialState();d.tasks=[newTask('焦点交接测试','inbox',dayKey(),'focus')];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
 await page.locator('.task-body').filter({hasText:'焦点交接测试'}).click();
 await expect(page.getByRole('complementary',{name:'任务详情'})).toBeVisible();
 await page.evaluate(()=>{window.__focusAfterExit=[];document.addEventListener('focusin',e=>{window.__focusAfterExit.push({row:!!e.target.closest('.task-body'),dialog:!!e.target.closest('[role=dialog]')})});const close=document.querySelector('.detail-header button');close.focus();close.click();const quick=document.querySelector('.toolbar-add');quick.focus();quick.click()});
 const dialog=page.getByRole('dialog',{name:'快速新建任务'});await expect(dialog.getByRole('textbox',{name:'快速任务名称'})).toBeFocused();await page.waitForTimeout(260);
 await expect(dialog.getByRole('textbox',{name:'快速任务名称'})).toBeFocused();expect(await page.evaluate(()=>window.__focusAfterExit.some(e=>e.row))).toBe(false);
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(dialog).toHaveCount(0);
});
for(const theme of ['light','dark'])test('补齐独立工作台及设置窄屏矩阵 '+theme,async({page})=>{
 const d=initialState();d.theme=theme;await page.setViewportSize({width:320,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.goto('/');mkdirSync('test-results/final-secondary',{recursive:true});
 await expect(page.locator('.task-content')).toBeVisible();const execution=page.getByRole('region',{name:'今日执行'});await expect(execution).toContainText('今日没有待执行任务');await expect(execution.getByRole('button',{name:'展开执行清单'})).toHaveCount(0);expect((await execution.boundingBox()).height).toBeLessThan(92);await page.screenshot({path:'test-results/final-secondary/'+theme+'-empty-tasks.png',animations:'disabled'});
 for(const [name,label,selector] of [['workflow','自动化工作台','.workflow-empty'],['goals','目标管理','.goal-progress-value'],['report','回顾报告','.review-scroll']]){
  await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.getByRole('button',{name:'打开'+label,exact:true}).first().click();const surface=page.locator('[data-workspace-module='+name+']');await expect(surface.locator(selector).first()).toBeVisible();
  expect(await surface.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);await page.screenshot({path:'test-results/final-secondary/'+theme+'-'+name+'.png',animations:'disabled'});
 }
 await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name:'设置',exact:true}).click();
 const settings=page.getByRole('dialog',{name:'设置与数据管理'}),nav=settings.getByRole('navigation',{name:'设置分类'});await expect(settings).toBeVisible();
 for(const [name,id] of [['账号与同步','account'],['外观与布局','appearance'],['本地数据','data'],['组件展厅','components']]){
  await nav.getByRole('button',{name,exact:true}).click();await expect(settings.locator('#settings-'+id)).toBeVisible();expect(await settings.getByRole('region',{name:'设置内容'}).evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
  await page.screenshot({path:'test-results/final-secondary/'+theme+'-settings-'+id+'.png',animations:'disabled'});
 }
});

test('普通构建即使存在试验标志也不迁移本地数据',async({page})=>{
 const d=initialState();d.tasks=[newTask('普通工作空间','inbox',dayKey(),'normal')];
 await page.addInitScript(d=>{sessionStorage.setItem('todo-idb-pilot','synthetic-only');if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.goto('/');await expect(page.getByText('本地数据已保存',{exact:false})).toBeVisible();await expect(page.locator('.task-row').filter({hasText:'普通工作空间'})).toBeVisible();
 const hasPilot=await page.evaluate(async()=>typeof indexedDB.databases==='function'&&(await indexedDB.databases()).some(db=>db.name==='todo-web-workspace-pilot-v1'));
 expect(hasPilot).toBe(false);await expect(page.getByText('IndexedDB 已保存',{exact:false})).toHaveCount(0);
});
