import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync,writeFileSync} from 'node:fs';
test('设置、备份与任务交换连续交接',async({page})=>{
 await page.goto('/');
 const settings=page.getByRole('dialog',{name:'设置与数据管理'}),backup=page.getByRole('dialog',{name:'完整工作空间备份'});
 await page.getByRole('button',{name:'设置',exact:true}).click();await expect(settings).toBeVisible();
 for(let i=0;i<3;i++){
  await settings.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();
  await settings.getByRole('button',{name:'完整工作空间备份',exact:true}).click();await expect(backup).toBeVisible();await expect(page.locator('.dialog[data-state=open]')).toHaveCount(1);
  await backup.getByRole('button',{name:'关闭',exact:true}).click();await expect(settings).toBeVisible();await expect(page.locator('.dialog[data-state=open]')).toHaveCount(1);
 }
 await settings.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();await settings.getByRole('button',{name:'CSV / Markdown 任务交换',exact:true}).click();
 const exchange=page.getByRole('dialog').filter({hasText:'Markdown'});await expect(exchange).toBeVisible();await expect(page.locator('.dialog[data-state=open]')).toHaveCount(1);
 await exchange.getByRole('button',{name:'关闭',exact:true}).click();await expect(settings).toBeVisible();
 await settings.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.locator('.dialog[data-state=open]')).toHaveCount(0);
 await page.getByRole('button',{name:'新建任务',exact:true}).click();const quick=page.getByRole('dialog',{name:'快速新建任务'});await expect(quick.getByRole('textbox',{name:'快速任务名称'})).toBeFocused();await quick.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.locator('.dialog[data-state=open]')).toHaveCount(0);
});
test('重复工作台挂载与卸载内存趋势',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','CDP heap sampling');test.setTimeout(120000);
 const d=initialState();d.tasks=Array.from({length:500},(_,i)=>newTask('工作台任务 '+i,'inbox',dayKey(),'workspace-'+i));
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 const rail=page.locator('.rail'),cycle=async()=>{for(const [label,selector] of [['日历','.calendar-main'],['每日规划','.planner'],['看板','.board-column'],['任务','.task-row']]){await rail.getByRole('button',{name:label,exact:true}).click();await expect(page.locator(selector).first()).toBeVisible()}};
 await cycle();const cdp=await context.newCDPSession(page),samples=[];const sample=async(i)=>{await cdp.send('HeapProfiler.collectGarbage');const {usedSize,totalSize}=await cdp.send('Runtime.getHeapUsage');samples.push({cycle:i,usedSize,totalSize})};await sample(0);
 const start=performance.now();for(let i=1;i<=30;i++){await cycle();if(i%10===0)await sample(i)}
 const result={tasks:500,cycles:30,workspaceSwitches:120,elapsedMs:performance.now()-start,samples,method:'after warmup, same context, force GC every 10 cycles; short stress sample, not hours-long leak test'};mkdirSync('test-results',{recursive:true});writeFileSync('test-results/workspace-lifecycle.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
});
