import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
import {chooseOption} from './select-helper.js';
import {mkdirSync} from 'node:fs';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
async function seed(page){
 const d=initialState(),date=dayKey();
 d.tasks=[{...newTask('多段工作', 'inbox',date,'a'),time:'09:00',duration:60,planMinutes:30,planSegments:[{id:'s',date,time:'10:00',minutes:30}],checklist:[{id:'1',text:'准备',done:true},{id:'2',text:'执行',done:false}]}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();return date;
}
test('批量创建与一次撤销，检查项重新排序',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'批量创建',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'批量创建任务'});await dialog.getByRole('textbox',{name:'批量任务文本'}).fill('阅读 明天 09:00 !2\n整理资料 后天');await expect(dialog.getByLabel('批量创建预览')).toContainText('阅读');await dialog.getByRole('button',{name:'创建 2 项任务'}).click();
 await expect.poll(async()=>(await stored(page)).tasks.length).toBe(3);
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(async()=>(await stored(page)).tasks.length).toBe(1);
 await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'多段工作'}).click();await page.getByRole('button',{name:'上移检查项 执行'}).click();
 await expect.poll(async()=>(await stored(page)).tasks[0].checklist.map(c=>c.id)).toEqual(['2','1']);
 expect((await stored(page)).tasks[0].checklist[1].done).toBe(true);
});
test('补充段时间轴键盘跨日、拉伸及撤销，主段不变',async({page})=>{
 const today=await seed(page);await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const move=page.getByRole('button',{name:'移动时间 多段工作 · 补充段 10:00'});await move.focus();await move.press('ArrowRight');
 await expect.poll(async()=>(await stored(page)).tasks[0].planSegments[0].date).toBe(shiftDay(today,1));
 const resize=page.getByRole('button',{name:'调整时长 多段工作 · 补充段 10:00'});await resize.focus();await resize.press('ArrowDown');
 await expect.poll(async()=>(await stored(page)).tasks[0].planSegments[0].minutes).toBe(45);
 const t=(await stored(page)).tasks[0];expect(t.duration).toBe(60);expect(t.time).toBe('09:00');expect(t.planMinutes).toBe(30);
 mkdirSync('test-results/v16-professional',{recursive:true});await page.screenshot({path:'test-results/v16-professional/planner.png',animations:'disabled'});
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(async()=>(await stored(page)).tasks[0].planSegments[0].minutes).toBe(30);
});
test('Obsidian Tasks 导入日期与原有收据保护',async({page})=>{
 const today=await seed(page);await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();await page.getByRole('button',{name:'CSV / Markdown 任务交换'}).click();
 const dialog=page.getByRole('dialog',{name:'任务数据交换'});await chooseOption(dialog.getByRole('combobox',{name:'交换格式'}),'obsidian');await dialog.getByRole('textbox',{name:'交换文本'}).fill('- [ ] Obsidian验收 ⏳ '+today+' 📅 '+shiftDay(today,1));await dialog.getByRole('button',{name:'解析预览'}).click();
 await dialog.getByRole('button',{name:'确认追加 1 项'}).click();
 await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.title==='Obsidian验收')?.deadline).toBe(shiftDay(today,1));
 expect((await stored(page)).importRuns.length).toBe(1);
});
test('批量属性预览、确认和工作模式不修改任务归属',async({page})=>{
 await seed(page);await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'多段工作'}).click({modifiers:['ControlOrMeta']});
 await page.getByRole('button',{name:'批量属性',exact:true}).click();const dialog=page.getByRole('dialog',{name:'批量属性编辑'});const input=dialog.getByRole('spinbutton',{name:'批量预计时长'});await input.fill('75');await input.press('Enter');await dialog.getByRole('button',{name:'预览修改'}).click();
 await expect(dialog.getByLabel('批量修改预览')).toContainText('60 → 75');expect((await stored(page)).tasks[0].duration).toBe(60);await dialog.getByRole('button',{name:'确认修改'}).click();await expect.poll(async()=>(await stored(page)).tasks[0].duration).toBe(75);
 expect((await stored(page)).tasks[0].planMinutes).toBe(30);
 const mode=async name=>{await page.getByRole('button',{name:'命令面板',exact:true}).click();const palette=page.getByRole('dialog',{name:'命令面板'});await palette.getByRole('combobox',{name:'搜索命令与任务'}).fill(name);await palette.getByRole('option').filter({hasText:name}).click()};
 await mode('专注阅读模式');await expect(page.locator('.app')).toHaveAttribute('data-sidebar-hidden','true');await expect(page.locator('.app')).not.toHaveAttribute('data-detail-visible','true');await mode('标准工作模式');await expect(page.locator('.app')).not.toHaveAttribute('data-sidebar-hidden','true');
 expect((await stored(page)).tasks[0].listId).toBe('inbox');
});
test('本机草稿跨刷新恢复，图片附件安全预览',async({page})=>{
 await seed(page);const open=async()=>{await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'多段工作'}).click();await page.getByRole('button',{name:'展开编辑',exact:true}).click();return page.getByRole('dialog',{name:'备注编辑工作台'})};
 let dialog=await open();await dialog.getByRole('textbox',{name:'工作台备注源码'}).fill('**本机草稿**');await dialog.getByRole('button',{name:'本机保留草稿'}).click();await expect(dialog.getByRole('status')).toContainText('草稿已保留');expect((await stored(page)).tasks[0].notes).toBe('');
 await page.reload();dialog=await open();await dialog.getByRole('button',{name:'恢复本机草稿'}).click();await expect(dialog.getByRole('textbox',{name:'工作台备注源码'})).toHaveValue('**本机草稿**');await dialog.getByRole('button',{name:'应用备注'}).click();await expect.poll(async()=>(await stored(page)).tasks[0].notes).toBe('**本机草稿**');
 await page.locator('.detail-extra input[type=file]').setInputFiles({name:'pixel.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=','base64')});
 await page.getByRole('button',{name:'预览附件 pixel.png'}).click();const preview=page.getByRole('dialog',{name:'pixel.png'});await expect(preview.getByRole('img',{name:'pixel.png'})).toBeVisible();await expect.poll(()=>preview.getByRole('img',{name:'pixel.png'}).evaluate(img=>img.naturalWidth)).toBe(1);
 await preview.getByRole('button',{name:'关闭',exact:true}).click();await expect(preview).toHaveCount(0);
});
test('补充段鼠标拖动实时预览和取消，独立占位与锁定',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const handle=page.getByRole('button',{name:'移动时间 多段工作 · 补充段 10:00'});await handle.scrollIntoViewIfNeeded();
 const box=await handle.boundingBox(),h=await page.locator('.time-block-body').evaluate(el=>parseFloat(el.style.getPropertyValue('--hour-size'))),x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+h,{steps:5});await expect(page.locator('.time-move-preview')).toContainText('11:00');expect((await stored(page)).tasks[0].planSegments[0].time).toBe('10:00');
 await handle.dispatchEvent('pointercancel');await page.mouse.up();await expect(page.locator('.time-move-preview')).toHaveCount(0);expect((await stored(page)).tasks[0].planSegments[0].time).toBe('10:00');
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+h,{steps:5});await page.mouse.up();await expect.poll(async()=>(await stored(page)).tasks[0].planSegments[0].time).toBe('11:00');
 await page.locator('button.time-block').filter({hasText:'多段工作'}).first().click();await page.getByRole('button',{name:'锁定时间块',exact:true}).click();await expect(page.getByRole('button',{name:/移动时间 多段工作/})).toHaveCount(0);
});
test('键盘Shift范围选择与反向收缩',async({page})=>{
 const d=initialState(),date=dayKey();d.tasks=['第一项','第二项','第三项'].map((title,i)=>newTask(title,'inbox',date,String(i)));
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.goto('/');await page.locator('[data-view-key=inbox]').click();const body=page.locator('.task-body').filter({hasText:'第一项'});await body.click();await body.press('Shift+ArrowDown');await expect(page.locator('.task-row.checked')).toHaveCount(2);await page.keyboard.press('Shift+ArrowDown');await expect(page.locator('.task-row.checked')).toHaveCount(3);await page.keyboard.press('Shift+ArrowUp');await expect(page.locator('.task-row.checked')).toHaveCount(2);
});
