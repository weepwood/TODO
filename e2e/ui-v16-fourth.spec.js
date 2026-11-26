import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
import {digest} from '../src/services/cloud-core.js';
import {readFile} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
async function seed(page,data){await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},data);await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible()}
async function shot(page,name){mkdirSync('test-results/v16-fourth',{recursive:true});await page.screenshot({path:'test-results/v16-fourth/'+name+'.png',animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)}
test('部分恢复预览、确认及一次撤销，其他记录不覆盖',async({page})=>{
 const d=initialState();d.tasks=[newTask('当前任务','inbox',dayKey(),'a'),newTask('保留任务','work','','b')];d.tasks[0].notes='原备注';await seed(page,d);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();await page.getByRole('button',{name:'完整工作空间备份',exact:true}).click();const modal=page.getByRole('dialog',{name:'完整工作空间备份'});
 const download=page.waitForEvent('download');await modal.getByRole('button',{name:'导出完整归档'}).click();const backup=JSON.parse((await readFile(await(await download).path())).toString());Object.assign(backup.workspace.tasks[0],{title:'归档标题',notes:'归档备注',priority:3,date:'2026-12-10'});backup.workspace.tasks[1].notes='未选择的记录';backup.workspaceSha256=await digest(backup.workspace);
 await modal.getByLabel('完整归档文件').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await expect(modal.getByText('完整性校验通过')).toBeVisible();await modal.getByRole('button',{name:'选择性恢复预览',exact:true}).click();
 const rows=modal.getByLabel('选择性恢复任务预览');await rows.getByRole('checkbox',{name:'归档标题'}).check();await modal.getByRole('button',{name:'预览内容恢复'}).click();
 const confirm=modal.getByLabel('内容恢复确认');await confirm.getByText('备注 · 变化',{exact:true}).click();await expect(confirm).toContainText('归档备注');await shot(page,'content-restore');await modal.getByRole('button',{name:'确认恢复所选内容'}).click();await expect(modal.getByText(/已载入 1 项内容/)).toBeVisible();
 let result=await stored(page);expect(result.tasks[0].title).toBe('归档标题');expect(result.tasks[0].date).toBe(d.tasks[0].date);expect(result.tasks[1].notes).toBe('');
 await modal.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(async()=>(await stored(page)).tasks[0].notes).toBe('原备注');
});
test('工作周当日应用和延续片段末端编辑',async({page})=>{
 const d=initialState(),today=dayKey(),next=shiftDay(today,1);d.tasks=[{...newTask('夜间延续','inbox',today,'night'),time:'23:30',duration:90,planMinutes:90}];await seed(page,d);
 await page.getByRole('button',{name:'每日规划',exact:true}).click();await page.getByRole('button',{name:'工作周规划'}).click();const weekly=page.getByRole('dialog',{name:'工作周与多日重排'});await weekly.getByRole('button',{name:'保存工作周'}).click();await weekly.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:'使用当日工作周时段'}).click();await expect(page.getByText(/已应用当日工作周时段|此日期为休息日/)).toBeVisible();
 await page.getByLabel('规划日期').fill(next);await page.getByRole('button',{name:'显示全天'}).click();const handle=page.getByRole('button',{name:'调整时长 夜间延续 · 延续',exact:true});await handle.scrollIntoViewIfNeeded();await handle.press('ArrowDown');await expect.poll(async()=>(await stored(page)).tasks[0].planMinutes).toBe(105);
 const t=(await stored(page)).tasks[0];expect(t.date).toBe(today);expect(t.time).toBe('23:30');expect(t.duration).toBe(90);await shot(page,'carry-edit');
});
test.describe('实际DST时间轴',()=>{
 test.use({timezoneId:'America/New_York'});
 test('秋季重复小时显示两个独立实际区间',async({page})=>{
 const d=initialState();d.theme='dark';d.calendarEvents=[{id:'first',title:'重复小时一',start:'2026-11-01T01:15:00-04:00',end:'2026-11-01T01:45:00-04:00'},{id:'second',title:'重复小时二',start:'2026-11-01T01:15:00-05:00',end:'2026-11-01T01:45:00-05:00'}];await seed(page,d);
 await page.getByRole('button',{name:'每日规划',exact:true}).click();await page.getByLabel('规划日期').fill('2026-11-01');const axis=page.getByLabel('实际经过时间轴');await expect(axis).toContainText('实际 25 小时');const one=axis.locator('.time-block').filter({hasText:'重复小时一'}),two=axis.locator('.time-block').filter({hasText:'重复小时二'});await expect(one).toContainText('UTC−04:00');await expect(two).toContainText('UTC−05:00');expect((await two.boundingBox()).y-(await one.boundingBox()).y).toBeGreaterThan(40);await shot(page,'dst-fold');await page.getByLabel('规划日期').fill('2026-03-08');await expect(axis).toContainText('实际 23 小时');
 });
});
