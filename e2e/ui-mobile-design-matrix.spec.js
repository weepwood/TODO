import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
for(const [width,height] of [[320,844],[390,844]])test('八模块移动端双主题 '+width,async({page})=>{
 test.setTimeout(90000);
 await page.setViewportSize({width,height});
 const d=initialState();d.tasks=[{...newTask('设计验收','inbox',dayKey()),time:'09:00'}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'移动端主导航'});
 const modules=[['任务','tasks','.task-row',true],['日历','calendar','.calendar-main [data-date]',true],['每日规划','planner','.planner-grid',true],['统计','stats','.stat-grid',true],['看板','board','.board-column',false],['四象限','matrix','.board-column',false],['专注','focus','.focus-card',false],['习惯','habits','input[placeholder="添加每日习惯"]',false]];
 for(const [theme,label] of [['light','浅色'],['dark','深色']]){
  await nav.getByRole('button',{name:'更多'}).click();await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'外观与布局'}).click();await page.getByRole('button',{name:label,exact:true}).click();
  await page.getByRole('dialog',{name:'设置与数据管理'}).getByRole('button',{name:'关闭',exact:true}).click();
  for(const [label,key,ready,primary] of modules){
   if(primary)await nav.getByRole('button',{name:label,exact:true}).click();
   else{await nav.getByRole('button',{name:'更多'}).click();await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name:label,exact:true}).click()}
   await expect(page.locator(ready).first()).toBeVisible();
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:'test-results/matrix-'+width+'-'+theme+'-'+key+'.png',animations:'disabled'});
  }
 }
});
