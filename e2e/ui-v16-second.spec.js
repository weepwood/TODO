import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
import {chooseOption} from './select-helper.js';
import {mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
const snap=async(page,name)=>{mkdirSync('test-results/v16-second',{recursive:true});await page.screenshot({path:'test-results/v16-second/'+name+'.png',animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)};
async function seed(page,theme='light'){
 const d=initialState(),date=dayKey();d.theme=theme;d.lists.find(l=>l.id==='work').sections=[{id:'project',name:'项目分组'}];
 d.tasks=[{...newTask('多段任务','inbox',date,'a'),time:'09:00',duration:60,planMinutes:30,planSegments:[{id:'s',date,time:'10:00',minutes:30}],checklist:[{id:'1',text:'准备',done:true},{id:'2',text:'执行',done:false}]},{...newTask('固定冲突','inbox',date,'fixed'),time:'12:00',duration:60,planLocked:true,planMinutes:60},{...newTask('待重排任务','inbox',date,'move'),time:'12:15',duration:30},{...newTask('历史研究','inbox',date,'history'),status:'completed',completedAt:new Date(date+'T12:00:00').toISOString()}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();return date;
}
async function command(page,name){await page.getByRole('button',{name:'全局搜索',exact:true}).click();const p=page.getByRole('dialog',{name:'命令面板'});await p.getByRole('combobox',{name:'搜索命令与任务'}).fill(name);await p.getByRole('option').filter({hasText:name}).click()}
test('清单分组预览、提交并撤销',async({page})=>{
 await seed(page);await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'多段任务'}).click({modifiers:['ControlOrMeta']});await page.getByRole('button',{name:'批量属性',exact:true}).click();
 const d=page.getByRole('dialog',{name:'批量属性编辑'});await chooseOption(d.getByRole('combobox',{name:'批量属性'}),'organization');await chooseOption(d.getByRole('combobox',{name:'批量组织清单'}),'work');await chooseOption(d.getByRole('combobox',{name:'批量组织分组'}),'project');await d.getByRole('button',{name:'预览修改'}).click();await expect(d.getByLabel('批量修改预览')).toContainText('项目分组');await snap(page,'organization-light');
 await d.getByRole('button',{name:'确认修改'}).click();await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='a').sectionId).toBe('project');expect((await stored(page)).tasks.find(t=>t.id==='a').listId).toBe('work');
 await page.getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='a').listId).toBe('inbox');
});
test('补充段鼠标拉伸实际提交、容量反馈及冲突重排',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await seed(page);await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const handle=page.getByRole('button',{name:'调整时长 多段任务 · 补充段 10:00'});await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox(),h=await page.locator('.time-block-body').evaluate(el=>parseFloat(el.style.getPropertyValue('--hour-size'))),x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+h/2,{steps:5});await expect(page.getByLabel('规划容量预览')).toContainText('剩余');await snap(page,'resize-preview');expect((await stored(page)).tasks[0].planSegments[0].minutes).toBe(30);await page.mouse.up();await expect.poll(async()=>(await stored(page)).tasks[0].planSegments[0].minutes).toBe(60);
 await page.getByRole('button',{name:'冲突重排',exact:true}).click();const d=page.getByRole('dialog',{name:'冲突重排预览'});await expect(d).toContainText('待重排任务');await snap(page,'reflow-light');await d.getByRole('button',{name:'确认重排'}).click();await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='move').time).not.toBe('12:15');expect((await stored(page)).tasks.find(t=>t.id==='fixed').time).toBe('12:00');expect(errors).toEqual([]);
});
test('命名模式跨模块及刷新恢复、工作时段模板',async({page})=>{
 await seed(page,'dark');await page.getByRole('button',{name:'每日规划',exact:true}).click();await page.getByRole('button',{name:'工作时段模板'}).click();let d=page.getByRole('dialog',{name:'工作时段模板'});await d.getByRole('textbox',{name:'时段模板名称'}).fill('早班');await d.getByRole('button',{name:'保存当前时段'}).click();await expect(d.getByRole('button',{name:'应用 早班'})).toBeVisible();await snap(page,'workhours-dark');await d.getByRole('button',{name:'应用 早班'}).click();
 await command(page,'命名工作模式');d=page.getByRole('dialog',{name:'命名工作模式'});await d.getByRole('textbox',{name:'工作模式名称'}).fill('规划模式');await d.getByRole('button',{name:'保存当前工作模式'}).click();await expect(d.getByRole('button',{name:'应用 规划模式'})).toBeVisible();await snap(page,'named-mode-dark');await d.getByRole('button',{name:'关闭',exact:true}).click();await page.reload();await command(page,'工作模式 规划模式');await expect(page.getByRole('button',{name:'每日规划',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByLabel('工作时间预算')).toBeVisible();
});
test('检查项鼠标拖动和本机Obsidian关联，历史检索',async({page})=>{
 await seed(page);await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'多段任务'}).click();
 const a=page.getByRole('button',{name:'拖动检查项 2'}),b=page.getByRole('button',{name:'拖动检查项 1'});await a.scrollIntoViewIfNeeded();const x=await a.boundingBox(),y=await b.boundingBox();await page.mouse.move(x.x+x.width/2,x.y+x.height/2);await page.mouse.down();await page.mouse.move(y.x+y.width/2,y.y+y.height/2-3,{steps:8});await page.mouse.up();await expect.poll(async()=>(await stored(page)).tasks[0].checklist.map(c=>c.id)).toEqual(['2','1']);
 await page.getByText('Obsidian 本机关联',{exact:true}).click();await page.getByRole('textbox',{name:'Obsidian 知识库'}).fill('知识库');await page.getByRole('textbox',{name:'Obsidian 笔记路径'}).fill('项目/笔记.md');await page.getByRole('button',{name:'保存笔记关联'}).click();await expect(page.getByRole('link',{name:'打开笔记'})).toHaveAttribute('href',/^obsidian:\/\/open\?vault=/);await snap(page,'association-light');
 await command(page,'历史归档检索');const d=page.getByRole('dialog',{name:'历史归档检索'});await d.getByRole('textbox',{name:'历史搜索'}).fill('历史研究');await d.getByRole('button',{name:'历史研究',exact:true}).click();await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('历史研究');
});
test('层级Markdown导入及备份差异实际检查',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();await page.getByRole('button',{name:'CSV / Markdown 任务交换'}).click();
 let d=page.getByRole('dialog',{name:'任务数据交换'});await chooseOption(d.getByRole('combobox',{name:'交换格式'}),'markdown-tree');await d.getByRole('textbox',{name:'交换文本'}).fill('- [ ] 父项\n  - [ ] 子项');await d.getByRole('button',{name:'解析预览'}).click();await expect(d).toContainText('↳ 子项');await d.getByRole('button',{name:'确认追加 2 项'}).click();await expect.poll(async()=>{const tasks=(await stored(page)).tasks;return tasks.find(t=>t.title==='子项')?.parentId===tasks.find(t=>t.title==='父项')?.id}).toBe(true);
 await d.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'完整工作空间备份',exact:true}).click();d=page.getByRole('dialog',{name:'完整工作空间备份'});const downloaded=page.waitForEvent('download');await d.getByRole('button',{name:'导出完整归档'}).click();const bytes=await readFile(await(await downloaded).path());await d.getByLabel('完整归档文件').setInputFiles({name:'test.json',mimeType:'application/json',buffer:bytes});await expect(d.getByLabel('备份差异预览')).toContainText('不变 6');await d.getByText('工作空间 SHA-256 校验值',{exact:true}).click();await expect(d.locator('.archive-hash')).toHaveText(/^[a-f0-9]{64}$/);await snap(page,'backup-light');
});
for(const theme of ['light','dark'])test('390宽度新工作模式及批量创建视觉 '+theme,async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page,theme);await command(page,'命名工作模式');let d=page.getByRole('dialog',{name:'命名工作模式'});await expect(d.getByRole('textbox',{name:'工作模式名称'})).toBeVisible();await snap(page,'mobile-modes-'+theme);await d.getByRole('button',{name:'关闭',exact:true}).click();await command(page,'批量创建任务');d=page.getByRole('dialog',{name:'批量创建任务'});await d.getByRole('textbox',{name:'批量任务文本'}).fill('任务一 明天\n任务二 后天');await expect(d.getByLabel('批量创建预览')).toContainText('任务二');await snap(page,'mobile-capture-'+theme);
});
test('日历直接拖动补充段，只修改所属补充段日期',async({page})=>{
 const today=await seed(page);await page.getByRole('button',{name:'日历',exact:true}).click();
 const event=page.locator('.calendar-main').getByRole('button',{name:'10时 多段任务',exact:true});
 await expect(event).toBeVisible();const target=page.locator('.calendar-main [data-date="'+shiftDay(today,1)+'"]').first();
 await target.scrollIntoViewIfNeeded();const a=await event.boundingBox(),b=await target.boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2+10,a.y+a.height/2,{steps:4});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:18});await page.mouse.up();
 await expect.poll(async()=>(await stored(page)).tasks[0].planSegments[0].date).toBe(shiftDay(today,1));const row=(await stored(page)).tasks[0];expect(row.date).toBe(today);expect(row.time).toBe('09:00');expect(row.planSegments[0].time).toBe('10:00');
});
