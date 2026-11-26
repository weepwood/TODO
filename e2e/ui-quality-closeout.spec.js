import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
async function seed(page,theme='light'){
 const d=initialState(),date=dayKey();d.theme=theme;
 d.tasks=[{...newTask('规划质量验收','inbox',date,'a'),time:'09:00',duration:60,planSegments:[{id:'s',date:shiftDay(date,1),time:'10:00',minutes:25}]},{...newTask('今日截止任务','inbox',date,'b'),deadline:date,priority:3},{...newTask('积压任务','inbox',shiftDay(date,-1),'c')}];
 d.habits=[{id:'habit',name:'阅读',days:[date],weeklyGoal:5,includeInPlan:true}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();
}
test('补充段直接编辑，锁定冻结实际占位',async({page})=>{
 await seed(page);await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'规划质量验收'}).click();
 await page.getByRole('button',{name:/编辑时间段/}).click();
 const n=page.getByRole('spinbutton',{name:'补充时间段分钟'});await n.fill('40');await n.press('Enter');await page.getByRole('button',{name:'保存时间段'}).click();
 await expect.poll(async()=>(await stored(page)).tasks[0].planSegments[0].minutes).toBe(40);
 await page.getByRole('button',{name:'锁定时间块',exact:true}).click();await expect.poll(async()=>(await stored(page)).tasks[0].planMinutes).toBe(60);await expect(page.getByRole('button',{name:/编辑时间段/})).toHaveCount(0);
});
test('布局预设使用统一对话框，保存应用删除',async({page})=>{
 await seed(page);
 const menu=page.getByRole('button',{name:'分组、排序与顺序'});
 const open=async()=>{await menu.click();await page.getByRole('menuitem',{name:'布局预设',exact:true}).click()};
 await open();await page.getByRole('menuitem',{name:'保存当前布局'}).click();const dialog=page.getByRole('dialog',{name:'保存布局预设'});await dialog.getByRole('textbox',{name:'预设名称'}).fill('验收布局');await dialog.getByRole('button',{name:'保存预设',exact:true}).click();
 await open();await page.getByRole('menuitem',{name:'验收布局'}).click();
 await open();await page.getByRole('menuitem',{name:'删除预设'}).click();const del=page.getByRole('dialog',{name:'删除布局预设'});await del.getByRole('button',{name:'验收布局'}).click();await del.getByRole('button',{name:'确认删除'}).click();await open();await expect(page.getByRole('menuitem',{name:'验收布局'})).toHaveCount(0);
});
for(const theme of ['light','dark'])test('页面截图矩阵 '+theme,async({page})=>{
 test.setTimeout(90000);await seed(page,theme);mkdirSync('test-results/quality-matrix',{recursive:true});
 for(const [name,label,selector] of [['tasks','任务','.task-row'],['planner','每日规划','.planner'],['calendar','日历','.calendar-main'],['board','看板','.board-column'],['focus','专注','[aria-label="今日专注队列"]'],['habits','习惯','.habits-view'],['stats','统计','.points-ledger']]){
  const button=page.locator('.rail').getByRole('button',{name:label,exact:true});await expect(button).toBeVisible();
  await button.click();await expect(page.locator(selector).first()).toBeVisible();await page.screenshot({path:'test-results/quality-matrix/'+theme+'-'+name+'.png',animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 for(const [name,label] of [['workflow','自动化工作台'],['report','回顾报告'],['goals','目标管理']]){
  await page.getByRole('button',{name:'打开'+label,exact:true}).first().click();await expect(page.locator('[data-workspace-module='+name+']')).toBeVisible();await page.screenshot({path:'test-results/quality-matrix/'+theme+'-'+name+'.png',animations:'disabled'});
 }
});
