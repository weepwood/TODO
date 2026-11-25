import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
import {chooseOption} from './select-helper.js';
async function seed(page,state,workflow){
 await page.addInitScript(({state,workflow})=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(state));if(workflow&&!localStorage.getItem('todo-workflow-rules-v1'))localStorage.setItem('todo-workflow-rules-v1',JSON.stringify(workflow))},{state,workflow});
 await page.setViewportSize({width:1440,height:900});await page.goto('/');
}
const task=(page,title)=>page.evaluate(title=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks.find(t=>t.title===title),title);
test('创建触发与字段级执行报告撤销，不重复触发',async({page})=>{
 const d=initialState(),today=dayKey();
 await seed(page,d,{auto:true,lastRun:today,rules:[{id:'r',name:'新任务高优先级',list:'all',condition:'any',action:'high',trigger:'created',enabled:true}]});
 await page.locator('[data-view-key=today]').click();
 await page.getByRole('textbox',{name:'新任务名称'}).fill('新建验收');await page.getByRole('button',{name:'添加',exact:true}).click();
 await expect.poll(async()=>(await task(page,'新建验收'))?.priority).toBe(3);
 await page.getByRole('button',{name:'自动化',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'任务工作流自动化'});await expect(dialog).toContainText('事件触发 · 1 项');
 await page.screenshot({path:'test-results/workflow-center-report.png',animations:'disabled'});
 page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'撤销',exact:true}).click();
 await expect.poll(async()=>(await task(page,'新建验收'))?.priority).toBe(0);await expect(dialog).toContainText('已撤销');
 await page.keyboard.press('Escape');await page.reload();await expect.poll(async()=>(await task(page,'新建验收'))?.priority).toBe(0);
});
test('系列管理中心发现旧端冲突并安全修复，月度回顾可保存',async({page})=>{
 const d=initialState(),today=dayKey(),t={...newTask('暂停冲突系列','inbox',today),repeat:'daily',repeatCount:9,miss:'skip',seriesHold:{count:10,miss:'skip'}};
 d.tasks=[t,{...newTask('正常系列','inbox',today),repeat:'daily'},{...newTask('结束系列','inbox',today),repeat:'daily',repeatCount:1}];
 await seed(page,d,null);
 await page.locator('[data-view-key=recurring]').click();await page.getByRole('button',{name:'系列管理'}).click();
 const dialog=page.getByRole('dialog',{name:'重复系列管理中心'});
 await expect(dialog).toContainText('暂停冲突系列');await expect(dialog).toContainText('待处理冲突');
 await page.screenshot({path:'test-results/series-center.png',animations:'disabled'});
 page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'修复暂停保护'}).click();
 await expect.poll(async()=>(await task(page,'暂停冲突系列')).repeatCount).toBe(1);
 await expect(dialog).toContainText('已暂停');await expect(dialog.getByRole('button',{name:'修复暂停保护'})).toHaveCount(0);
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'统计',exact:true}).click();await page.getByRole('button',{name:'任务回顾'}).click();
 const review=page.getByRole('dialog',{name:'任务回顾'});await review.getByRole('button',{name:'每月',exact:true}).click();
 await expect(review.getByRole('group',{name:'最近六个月趋势'})).toBeVisible();await expect(review).toContainText('清单时间分配');
 await review.getByRole('button',{name:'保存快照'}).click();await expect(review).toContainText('每月');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-review-snapshots-v1'))[0].mode)).toBe('month');
 await review.getByRole('group',{name:'最近六个月趋势'}).scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/monthly-review.png',animations:'disabled'});
});
