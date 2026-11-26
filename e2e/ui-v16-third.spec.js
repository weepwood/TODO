import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
import {chooseOption} from './select-helper.js';
import {mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {digest} from '../src/services/cloud-core.js';
import {exportTasks} from '../src/core/task-exchange.js';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
const command=async(page,name)=>{await page.getByRole('button',{name:'全局搜索',exact:true}).click();const p=page.getByRole('dialog',{name:'命令面板'});await p.getByRole('combobox',{name:'搜索命令与任务'}).fill(name);await p.getByRole('option').filter({hasText:name}).click()};
async function seed(page,theme='light'){
 const d=initialState(),today=dayKey();d.theme=theme;
 d.tasks=[newTask('工作甲','work',today,'a'),newTask('个人乙','personal',today,'b'),{...newTask('每日复查','inbox',today,'series'),repeat:'daily',seriesStart:today},{...newTask('固定星期五','inbox','2026-11-27','fixed'),time:'09:00',duration:540,planMinutes:540,planLocked:true},{...newTask('重排任务','inbox','2026-11-27','move'),time:'10:00',duration:30},{...newTask('午夜任务','inbox',today,'night'),time:'23:30',duration:30,planMinutes:30}];
 d.templates=[{id:'t',name:'检查模板',task:{...d.tasks[0],checklist:[{id:'old',text:'复查',done:true}]}}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();return today;
}
const shot=async(page,name)=>{mkdirSync('test-results/v16-third',{recursive:true});await page.screenshot({path:'test-results/v16-third/'+name+'.png',animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)};
test('跨清单键盘选择、实际归属反馈与整体撤销',async({page})=>{
 await seed(page);await command(page,'跨清单组织任务');const d=page.getByRole('dialog',{name:'跨清单组织任务'});
 await chooseOption(d.getByRole('combobox',{name:'组织来源清单'}),'work');await d.getByRole('checkbox',{name:'选择组织 工作甲'}).focus();await page.keyboard.press('Space');
 await chooseOption(d.getByRole('combobox',{name:'组织来源清单'}),'personal');await d.getByRole('checkbox',{name:'选择组织 个人乙'}).focus();await page.keyboard.press('Space');
 await expect(d).toContainText('已选 2 项');await d.getByRole('button',{name:'预览组织'}).click();await expect(d.getByLabel('跨清单组织预览')).toContainText('工作甲');await shot(page,'organization');
 await d.getByRole('button',{name:'确认组织'}).click();await expect(d.getByRole('status')).toContainText('实际符合目标 2 / 2');await d.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'撤销',exact:true}).click();await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='a').listId).toBe('work');
});
test('重复系列批量暂停恢复及模板重命名确认',async({page})=>{
 await seed(page);await command(page,'重复系列管理中心');let d=page.getByRole('dialog',{name:'重复系列管理中心'});
 await d.getByRole('checkbox',{name:'选择系列 每日复查'}).check();await d.getByRole('button',{name:'预览批量暂停'}).click();await expect(d.getByLabel('系列批量预览')).toContainText('每日复查');await shot(page,'series');await d.getByRole('button',{name:'确认批量暂停'}).click();await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='series').repeatCount).toBe(1);
 await d.getByRole('checkbox',{name:'选择系列 每日复查'}).check();await d.getByRole('button',{name:'预览批量恢复'}).click();await d.getByRole('button',{name:'确认批量恢复'}).click();await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='series').seriesHold).toBe(null);await d.getByRole('button',{name:'关闭',exact:true}).click();
 await command(page,'任务模板管理');d=page.getByRole('dialog',{name:'任务模板',exact:true});await d.getByRole('button',{name:'重命名'}).click();await d.getByRole('textbox',{name:'新模板名称'}).fill('复查模板');await d.getByRole('button',{name:'确认重命名'}).click();await expect(d.getByRole('button',{name:'复查模板'})).toBeVisible();
});
test('工作周跨休息日重排与容量确认',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-26T08:00'));
 await seed(page,'dark');await page.getByRole('button',{name:'每日规划',exact:true}).click();await page.getByLabel('规划日期').fill('2026-11-27');await page.getByRole('button',{name:'工作周规划'}).click();const d=page.getByRole('dialog',{name:'工作周与多日重排'});await expect(d.getByLabel('多日容量')).toContainText('休息日');await d.getByRole('button',{name:'保存工作周'}).click();await expect(d.getByRole('status')).toContainText('工作周已保存');await d.getByRole('button',{name:'预览多日重排'}).click();await expect(d.getByLabel('多日重排预览')).toContainText('2026-11-30 09:00');await expect(d.locator('.weekly-hours-list')).toHaveCSS('max-height','none');await shot(page,'weekly-dark');await d.getByRole('button',{name:'确认多日重排'}).click();await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='move').date).toBe('2026-11-30');expect((await stored(page)).tasks.find(t=>t.id==='fixed').time).toBe('09:00');
});
test('全天跨午夜键盘拉伸保留预计时长及次日延续',async({page})=>{
 const today=await seed(page);await page.getByRole('button',{name:'每日规划',exact:true}).click();await page.getByRole('button',{name:'显示全天'}).click();
 const r=page.getByRole('button',{name:'调整时长 午夜任务',exact:true});await r.scrollIntoViewIfNeeded();await r.focus();await r.press('ArrowDown');await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='night').planMinutes).toBe(45);expect((await stored(page)).tasks.find(t=>t.id==='night').duration).toBe(30);await page.getByLabel('规划日期').fill(shiftDay(today,1));await expect(page.locator('button.time-block').filter({hasText:'午夜任务'})).toContainText('延续');
});
test('命名模式文件导入并恢复列表配置和密度',async({page})=>{
 await seed(page);await command(page,'命名工作模式');let d=page.getByRole('dialog',{name:'命名工作模式'});
 const row={name:'紧凑任务',module:'tasks',view:'today',sidebarHidden:false,detailVisible:false,sidebar:228,detail:350,listLayout:{sort:'title',group:'list',order:'asc',completed:'hide',fields:['date']},appearance:{density:'compact',font:'large'}};
 await d.getByLabel('导入布局配置文件').setInputFiles({name:'modes.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'todo-workspace-modes',version:1,modes:[row]}))});await expect(d.getByLabel('布局导入预览')).toContainText('新增 1');await d.getByRole('button',{name:'确认追加配置'}).click();await expect(d.getByRole('button',{name:'应用 紧凑任务'})).toBeVisible();await shot(page,'mode-import');await d.getByRole('button',{name:'应用 紧凑任务'}).click();await expect(page.locator('html')).toHaveAttribute('data-density','compact');
 const pref=await page.evaluate(()=>JSON.parse(localStorage.getItem('todo-view-preferences-v1')));expect(pref.views.today.sort).toBe('title');expect(pref.views.today.fields).toEqual(['date']);
});
test('本机草稿目录与复杂Markdown安全保留',async({page})=>{
 await seed(page);await page.evaluate(()=>{localStorage.setItem('todo-note-draft-v1:a',JSON.stringify({base:'',text:'本机草稿正文',at:new Date().toISOString()}));localStorage.setItem('todo-note-draft-v1:orphan',JSON.stringify({base:'',text:'孤立草稿',at:new Date().toISOString()}))});
 await command(page,'本机草稿管理');const d=page.getByRole('dialog',{name:'本机草稿管理'});await expect(d).toContainText('2 / 2 份草稿');await expect(d).toContainText('任务已删除或不存在');await d.getByRole('textbox',{name:'搜索备注草稿'}).fill('工作甲');await expect(d).toContainText('1 / 2');await shot(page,'drafts');await d.getByRole('button',{name:'打开任务'}).click();
 await page.getByRole('button',{name:'展开编辑'}).click();const editor=page.getByRole('dialog',{name:'备注编辑工作台'});const original=['```html','<div>代码示例</div>','```'].join('\n');await editor.getByRole('textbox',{name:'工作台备注源码'}).fill(original);await editor.getByRole('button',{name:'可视化编辑'}).click();await expect(editor.getByRole('textbox',{name:'可视化备注编辑器'}).or(editor.getByRole('alert'))).toBeVisible();await editor.getByRole('button',{name:'返回源码'}).click();await expect(editor.getByRole('textbox',{name:'工作台备注源码'})).toHaveValue(original);
});
test('跨清单层级导入及只读备份差异标记',async({page})=>{
 await seed(page);const d0=initialState(),p=newTask('外部父','work','','p'),c={...newTask('外部子','personal','','c'),parentId:'p'};const raw=exportTasks([p,c],'markdown-workspace',d0.lists);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();await page.getByRole('button',{name:'CSV / Markdown 任务交换'}).click();let d=page.getByRole('dialog',{name:'任务数据交换'});
 await chooseOption(d.getByRole('combobox',{name:'交换格式'}),'markdown-workspace');await d.getByRole('textbox',{name:'交换文本'}).fill(raw);await d.getByRole('button',{name:'解析预览'}).click();await expect(d).toContainText('↳ 外部子');await d.getByRole('button',{name:'确认追加 2 项'}).click();await expect.poll(async()=>{const tasks=(await stored(page)).tasks,p=tasks.find(t=>t.title==='外部父'),c=tasks.find(t=>t.title==='外部子');return p?.listId==='work'&&c?.listId==='personal'&&c.parentId===p.id}).toBe(true);
 await d.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'完整工作空间备份',exact:true}).click();d=page.getByRole('dialog',{name:'完整工作空间备份'});const download=page.waitForEvent('download');await d.getByRole('button',{name:'导出完整归档'}).click();const parsed=JSON.parse((await readFile(await(await download).path())).toString());parsed.workspace.tasks.find(t=>t.id==='a').notes='备份内不同';parsed.workspaceSha256=await digest(parsed.workspace);
 await d.getByLabel('完整归档文件').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(parsed))});await expect(d.getByText('完整性校验通过')).toBeVisible();await d.getByRole('button',{name:'选择性恢复预览',exact:true}).click();const list=d.getByLabel('选择性恢复任务预览');await expect(list).toContainText('工作甲');await expect(list).toContainText('备注');await list.getByRole('checkbox').first().check();await expect(d.getByRole('status')).toContainText('已标记 1 项');await shot(page,'backup-selection');expect((await stored(page)).tasks.find(t=>t.id==='a').notes).toBe('');
});

for(const theme of ['light','dark'])test('四象限截图与工作周移动窄屏 '+theme,async({page})=>{
 await seed(page,theme);await page.getByRole('button',{name:'四象限',exact:true}).click();await expect(page.locator('.lane-heading').filter({hasText:'重要且紧急'})).toBeVisible();await shot(page,'matrix-'+theme);
 await page.getByRole('button',{name:'每日规划',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/^规划设置/}).click();await page.getByRole('button',{name:'工作周规划'}).click();const d=page.getByRole('dialog',{name:'工作周与多日重排'});await expect(d.getByText('每周工作时段')).toBeVisible();await expect(d.locator('.weekly-hours-list')).toHaveCSS('max-height','none');await shot(page,'weekly-mobile-'+theme);await d.getByRole('textbox',{name:'周0开始',exact:true}).scrollIntoViewIfNeeded();await expect(d.getByRole('textbox',{name:'周0开始',exact:true})).toBeVisible();await d.getByRole('button',{name:'关闭',exact:true}).click();
});
