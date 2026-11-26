import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
// Exercise the real first-use default rather than the edit-mode fixture used
// by legacy control-level suites.
test.use({storageState:{cookies:[],origins:[]}});
async function seed(page){
 const state=initialState(),today=dayKey();
 state.tags=[{id:'tag-demo',name:'学习',color:'#8056c4'}];
 state.tasks=[{...newTask('分区验收','inbox',today),notes:'项目说明',tags:['tag-demo'],duration:30,points:5,checklist:[{id:'check-demo',text:'检查事项',done:false}]}];
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(data))},state);
 await page.goto('/');await page.locator('.task-body').filter({hasText:'分区验收'}).click();
}
test('八区属性检查器原位编辑、布局稳定与持久化',async({page})=>{
 await page.setViewportSize({width:1520,height:1000});await seed(page);
 const detail=page.locator('.detail-content'),cards=detail.locator('.detail-section-card'),plan=detail.locator('[data-detail-section=plan]'),org=detail.locator('[data-detail-section=organization]');
 await expect(cards).toHaveCount(8);
 await expect(detail.getByRole('button',{name:'编辑全部',exact:true})).toHaveCount(0);
 await expect(detail.locator('.detail-section-toggle')).toHaveCount(8);
 const duration=plan.getByRole('spinbutton',{name:'预计分钟'});
 await expect(duration).toHaveValue('30');
 await expect(detail.locator('[data-detail-section=notes]')).toContainText('#学习');
 await expect(detail.getByRole('textbox',{name:'任务备注'})).toHaveValue('项目说明');
 const before=await org.boundingBox();await duration.fill('45');await duration.press('Enter');
 await expect(duration).toHaveValue('45');
 expect(Math.abs((await org.boundingBox()).y-before.y)).toBeLessThan(2);
 await duration.fill('90');await duration.press('Escape');await expect(duration).toHaveValue('45');
 await plan.getByRole('button',{name:'计划日期',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'计划日期选择器'});await picker.getByRole('button',{name:'明天',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks[0].date)).toBe(dayKey());
 await picker.getByRole('button',{name:'确定',exact:true}).click();
 await expect(picker).toHaveCount(0);
 await page.getByRole('checkbox',{name:'检查事项'}).check();
 const checkText=page.getByRole('textbox',{name:'编辑检查项 检查事项'});await checkText.fill('已更新检查项');await checkText.press('Enter');await expect(page.getByRole('checkbox',{name:'已更新检查项'})).toBeChecked();
 await page.screenshot({path:'test-results/detail-inspector-overview.png',animations:'disabled'});
 await page.reload();await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'分区验收'}).click();
 await expect(duration).toHaveValue('45');await expect(page.getByRole('checkbox',{name:'已更新检查项'})).toBeChecked();
});
test('移动端分区导航、提醒草稿取消与历史展开',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page);
 const detail=page.locator('.detail-content'),nav=detail.getByRole('navigation',{name:'任务详情分区'});
 await nav.getByRole('button',{name:'计划',exact:true}).click();
 const reminders=detail.locator('[data-detail-section=plan]');
 await reminders.getByRole('button',{name:'提醒',exact:true}).click();
 const popup=page.getByRole('dialog',{name:'提醒设置',exact:true});
 await popup.getByRole('button',{name:'添加提醒'}).click();
 await popup.getByRole('button',{name:'取消',exact:true}).click();
 await expect(reminders).toContainText('未设置');
 await nav.getByRole('button',{name:'附件',exact:true}).click();
 await expect(detail.locator('[data-detail-section=resources]')).toContainText('暂无附件');
 await nav.getByRole('button',{name:'记录',exact:true}).click();
 await expect(detail.getByRole('heading',{name:/^活动记录/})).toBeVisible();
 await expect(detail.getByRole('group',{name:'任务活动时间线'})).toContainText('创建任务');
 expect(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:'test-results/detail-sections-mobile.png',animations:'disabled'});
});

test('高级属性原位浮层统一确认、取消及标签直接更新',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 const detail=page.locator('.detail-content'),rem=detail.locator('[data-detail-section=plan]'),stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks[0]);
 const plan=detail.locator('[data-detail-section=plan]');
 await plan.getByRole('textbox',{name:'计划时间',exact:true}).fill('10:00');await plan.getByRole('textbox',{name:'计划时间',exact:true}).press('Enter');
 await rem.getByRole('button',{name:'提醒',exact:true}).click();const reminders=page.getByRole('dialog',{name:'提醒设置',exact:true});
 await reminders.getByRole('button',{name:'提前 5 分钟',exact:true}).click();expect((await stored()).reminderAt).toBe('');
 await reminders.getByRole('button',{name:'取消',exact:true}).click();expect((await stored()).reminderAt).toBe('');
 await rem.getByRole('button',{name:'提醒',exact:true}).click();await reminders.getByRole('button',{name:'提前 5 分钟',exact:true}).click();await reminders.getByRole('button',{name:'确定',exact:true}).click();
 await expect.poll(async()=>(await stored()).reminderAt).toBe(dayKey()+'T09:55');
 await rem.getByRole('button',{name:'重复',exact:true}).click();const repeat=page.getByRole('dialog',{name:'重复设置',exact:true});
 await repeat.getByRole('combobox',{name:'重复规则'}).click();await page.getByRole('option',{name:'每天',exact:true}).click();expect((await stored()).repeat).toBe('none');
 await page.screenshot({path:'test-results/detail-inspector-repeat.png',animations:'disabled'});
 await repeat.getByRole('button',{name:'确定',exact:true}).click();await expect.poll(async()=>(await stored()).repeat).toBe('daily');
 await detail.getByRole('button',{name:'编辑标签'}).click();const tags=page.getByRole('dialog',{name:'编辑标签设置'});await tags.getByRole('button',{name:'#学习',exact:true}).click();await tags.getByRole('button',{name:'完成',exact:true}).click();await expect.poll(async()=>(await stored()).tags).toEqual([]);
 await detail.getByRole('textbox',{name:'任务备注'}).fill('直接修改备注');await expect.poll(async()=>(await stored()).notes).toBe('直接修改备注');
});

test('详情内容区紧凑入口、备注预览、链接草稿及重复提醒展示',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 const state=initialState(),today=dayKey();state.tasks=[{...newTask('内容精修验收','inbox',today),reminderAt:today+'T09:00',extraReminders:[{id:'repeat-reminder',at:today+'T09:00',sentAt:null}]}];
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(data))},state);
 await page.goto('/');await page.locator('.task-body').filter({hasText:'内容精修验收'}).click();
 const detail=page.locator('.detail-content'),resources=detail.locator('[data-detail-section=resources]'),rem=detail.locator('[data-detail-section=plan]');
 await expect(rem.locator('.inspector-reminder-row')).toHaveCount(1);await expect(rem.locator('.inspector-reminder-row')).toContainText('×2');
 await expect(resources.getByRole('textbox')).toHaveCount(0);
 await expect(resources.getByRole('button',{name:'添加本机附件'})).toBeVisible();
 await resources.getByRole('button',{name:'添加链接',exact:true}).click();
 const popup=page.getByRole('dialog',{name:'添加关联链接'}),url=popup.getByRole('textbox',{name:'链接地址'});
 await url.fill('javascript:alert(1)');await popup.getByRole('button',{name:'添加链接',exact:true}).click();await expect(popup.getByRole('alert')).toBeVisible();
 await url.fill('https://example.com/guide');await popup.getByRole('textbox',{name:'链接名称'}).fill('验收资料');await popup.getByRole('button',{name:'取消'}).click();
 await expect(resources.getByRole('link',{name:'打开 验收资料'})).toHaveCount(0);
 await resources.getByRole('button',{name:'添加链接',exact:true}).click();await expect(url).toHaveValue('https://example.com/guide');await popup.getByRole('button',{name:'添加链接',exact:true}).click();
 await expect(resources.getByRole('link',{name:'打开 验收资料'})).toHaveAttribute('href','https://example.com/guide');
 await detail.getByRole('textbox',{name:'任务备注'}).fill('**备注内容**');await detail.getByRole('button',{name:'预览',exact:true}).click();await expect(detail.locator('.markdown-preview strong')).toHaveText('备注内容');
 await detail.getByRole('button',{name:'编辑',exact:true}).click();await expect(detail.getByRole('textbox',{name:'任务备注'})).toHaveValue('**备注内容**');
 await detail.locator('[data-detail-section=notes]').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/detail-polish-content.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await detail.locator('[data-detail-section=resources]').scrollIntoViewIfNeeded();
 await expect.poll(()=>detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:'test-results/detail-polish-mobile.png',animations:'disabled'});
 await page.reload();await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'内容精修验收'}).click();await expect(resources.getByRole('link',{name:'打开 验收资料'})).toBeVisible();
 await resources.getByRole('button',{name:'移除链接 验收资料'}).click();await expect(resources.getByRole('link',{name:'打开 验收资料'})).toHaveCount(0);
});

test('活动与系列历史时间线按真实时间和计划日期分别显示',async({page})=>{
 const state=initialState(),today=dayKey(),task={...newTask('系列时间线验收','inbox',today),repeat:'daily',seriesId:'series-timeline',occurrenceIndex:6,createdAt:'2026-11-25T08:00:00Z',previousId:'timeline-5'};
 state.tasks=[task,...Array.from({length:5},(_,i)=>({...newTask('历史实例 '+i,'inbox','2026-11-'+String(20+i)),id:'timeline-'+(i+1),seriesId:task.seriesId,occurrenceIndex:i+1,status:'completed',completedAt:'2026-11-25T09:00:00Z'}))];
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'系列时间线验收'}).click();
 const panel=page.locator('[data-detail-section=activity]'),events=panel.getByRole('group',{name:'任务活动时间线'}),series=panel.getByRole('group',{name:'重复系列计划时间线'});
 await expect(events.getByRole('listitem')).toHaveCount(2);await expect(events).toContainText('由上一重复实例生成');
 await expect(series.getByRole('listitem')).toHaveCount(3);
 await expect(series.locator('.activity-timeline-date').first()).toHaveText('2026-11-24');
 await panel.getByRole('button',{name:'查看更多历史（5 项）'}).click();await expect(series.getByRole('listitem')).toHaveCount(5);
 await panel.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/activity-timeline-desktop.png',animations:'disabled'});
 await panel.getByRole('button',{name:'收起历史'}).click();await expect(series.getByRole('listitem')).toHaveCount(3);
 await panel.getByRole('button',{name:'查看重复系列'}).click();await expect(page.getByRole('dialog',{name:'重复任务系列'})).toBeVisible();
});

test('活动日志记录标题、属性、备注与刷新且不记录取消',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 const detail=page.locator('.detail-content'),panel=detail.locator('[data-detail-section=activity]'),timeline=panel.getByRole('group',{name:'任务活动时间线'});
 await expect(timeline).toContainText('创建任务');
 const row=page.locator('.task-row').filter({hasText:'分区验收'});
 await row.locator('.task-title-text').click();const title=page.getByRole('textbox',{name:'行内任务标题'});await title.fill('已改名称');await title.press('Enter');
 await expect(timeline).toContainText('修改任务名称');await expect(timeline).toContainText('分区验收');await expect(timeline).toContainText('已改名称');
 const priority=detail.getByRole('combobox',{name:'优先级',exact:true});await priority.click();await page.getByRole('option',{name:'高优先级',exact:true}).click();
 await expect(timeline).toContainText('修改优先级');
 const duration=detail.getByRole('spinbutton',{name:'预计分钟'});await duration.fill('65');await duration.press('Escape');await expect(timeline).not.toContainText('修改预计时长');
 const notes=detail.getByRole('textbox',{name:'任务备注'});await notes.fill('第一次');await notes.fill('第二次修改');await expect(timeline.getByText('修改备注',{exact:true})).toHaveCount(1);
 await expect(timeline).not.toContainText('第二次修改');
 const filter=panel.getByRole('combobox',{name:'筛选活动记录'});await filter.click();await page.getByRole('option',{name:'属性修改',exact:true}).click();await expect(timeline).toContainText('修改任务名称');await expect(timeline).not.toContainText('修改备注');
 await filter.click();await page.getByRole('option',{name:'全部',exact:true}).click();
 await panel.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/task-audit-timeline.png',animations:'disabled'});
 await page.reload();await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'已改名称'}).click();
 await expect(timeline).toContainText('修改任务名称');await expect(timeline).toContainText('修改优先级');await expect(timeline.getByText('修改备注',{exact:true})).toHaveCount(1);
 const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks[0].activity);expect(new Set(persisted.map(e=>e.id)).size).toBe(persisted.length);
});

test('活动时间线低强调筛选、信息提示及较长历史展开',async({page})=>{
 const state=initialState(),task=newTask('历史扩容验收','inbox',dayKey());
 task.activity=Array.from({length:65},(_,i)=>({id:'history-'+i,taskId:task.id,operation:'op-'+i,session:'',at:new Date(Date.UTC(2026,10,25,12,i)).toISOString(),source:'manual',kind:'title',label:'修改任务名称',category:'property',changes:[{field:'title',label:'修改任务名称',before:'旧'+i,after:'新'+i}]}));
 state.tasks=[task];await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'历史扩容验收'}).click();
 const panel=page.locator('[data-detail-section=activity]'),timeline=panel.getByRole('group',{name:'任务活动时间线'}),filter=panel.getByRole('combobox',{name:'筛选活动记录'}),info=panel.getByRole('button',{name:'活动记录说明'});
 await panel.scrollIntoViewIfNeeded();await page.mouse.move(0,0);
 await expect(filter).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(filter).toHaveCSS('border-top-color','rgba(0, 0, 0, 0)');
 await expect(timeline.getByRole('listitem')).toHaveCount(10);
 await expect(panel).not.toContainText('最多保留最近');await info.hover();
 const tip=page.getByRole('tooltip');await expect(tip).toContainText('300 条');await expect(tip).toContainText('192 KiB');
 await page.mouse.move(0,0);await expect(tip).toHaveCount(0);
 await info.evaluate(el=>el.blur());await info.focus();await expect(info).toBeFocused();await expect(tip).toBeVisible();await page.keyboard.press('Escape');await expect(tip).toHaveCount(0);
 await panel.getByRole('button',{name:/查看更多活动/}).click();await expect(timeline.getByRole('listitem')).toHaveCount(30);
 await panel.getByRole('button',{name:/查看更多活动/}).click();await expect(timeline.getByRole('listitem')).toHaveCount(50);
 await panel.getByRole('button',{name:/查看更多活动/}).click();await expect(timeline.getByRole('listitem')).toHaveCount(66);
 await panel.getByRole('button',{name:'收起活动'}).click();await expect(timeline.getByRole('listitem')).toHaveCount(10);
 await filter.click();await page.getByRole('option',{name:'属性修改',exact:true}).click();await expect(timeline).not.toContainText('创建任务');
 await panel.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/activity-polish.png',animations:'disabled'});
});

test('独立检查清单子任务关联卡片及轻量进度',async({page})=>{
 const state=initialState(),today=dayKey(),task={...newTask('独立卡片验收','inbox',today),checklist:[{id:'c1',text:'检查一',done:false},{id:'c2',text:'检查二',done:false}]};
 const dep=newTask('前置资料','inbox',today);
 state.tasks=[task,dep];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.locator('.task-body').filter({hasText:'独立卡片验收'}).click();
 const detail=page.locator('.detail-content'),checks=detail.locator('[data-detail-section=checklist]'),children=detail.locator('[data-detail-section=children]'),relations=detail.locator('[data-detail-section=relations]');
 await expect(checks.getByRole('heading',{name:'检查清单',exact:true})).toBeVisible();
 await expect(children.getByRole('heading',{name:'子任务',exact:true})).toBeVisible();
 await expect(relations.getByRole('heading',{name:'关联任务',exact:true})).toBeVisible();
 await expect(checks.locator('progress')).toHaveCount(0);
 const progress=checks.getByRole('progressbar',{name:'检查清单进度'});await expect(progress).toHaveAttribute('aria-valuenow','0');
 await checks.getByRole('checkbox',{name:'检查一'}).check();await expect(progress).toHaveAttribute('aria-valuenow','1');
 await expect(checks.locator('.detail-section-meta')).toContainText('1/2');
 const input=checks.getByRole('textbox',{name:'新检查项'});await input.fill('第三项');await input.press('Enter');await expect(progress).toHaveAttribute('aria-valuemax','3');
 const child=children.getByRole('textbox',{name:'新建子任务'});await child.fill('新子任务验收');await child.press('Enter');
 await expect(children.getByRole('button',{name:/新子任务验收/})).toBeVisible();
 await relations.getByRole('combobox',{name:'前置任务',exact:true}).click();await page.getByRole('option',{name:'前置资料',exact:true}).click();
 await expect(relations.getByRole('button',{name:'前置资料',exact:true})).toBeVisible();
 await expect(relations).toContainText('前置任务未完成');
 await checks.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/detail-split.png',animations:'disabled'});
 await page.reload();await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'独立卡片验收'}).click();
 await expect(progress).toHaveAttribute('aria-valuenow','1');await expect(children.getByRole('button',{name:/新子任务验收/})).toBeVisible();await expect(relations.getByRole('button',{name:'前置资料',exact:true})).toBeVisible();
});

test('合并计划卡片、搜索选择与分组行内新建',async({page})=>{
 const state=initialState(),today=dayKey(),task=newTask('搜索选择验收','inbox',today);
 state.lists[0].sections=[{id:'study',name:'学习资料'},{id:'game',name:'游戏计划'}];
 state.lists.push({id:'research',name:'专业研究',color:'#6784da',folderId:null,sections:[]});
 state.tasks=[task,newTask('参考资料甲','inbox',today),newTask('前置资料乙','inbox',today)];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.locator('.task-body').filter({hasText:'搜索选择验收'}).click();
 const detail=page.locator('.detail-content'),plan=detail.locator('[data-detail-section=plan]'),org=detail.locator('[data-detail-section=organization]'),relations=detail.locator('[data-detail-section=relations]');
 await expect(plan.getByRole('button',{name:'提醒',exact:true})).toBeVisible();await expect(plan.getByRole('button',{name:'重复',exact:true})).toBeVisible();
 await expect(detail.locator('[data-detail-section=reminders]')).toHaveCount(0);
 const group=org.getByRole('combobox',{name:'分组',exact:true});await group.click();
 const search=page.getByRole('searchbox',{name:'搜索分组'});await expect(search).toBeFocused();
 await search.fill('不存在');await expect(page.getByRole('status').filter({hasText:'未找到匹配项'})).toBeVisible();
 await search.fill('游戏');await expect(page.getByRole('option')).toHaveCount(1);await search.press('Enter');await expect(group).toContainText('游戏计划');
 await group.click();await search.fill('学习');await search.press('Escape');await expect(group).toContainText('游戏计划');
 const plus=org.getByRole('button',{name:'新建分组',exact:true});const a=await group.boundingBox(),b=await plus.boundingBox();expect(b.x).toBeGreaterThanOrEqual(a.x+a.width-1);
 await plus.click();const dialog=page.getByRole('dialog',{name:'新建分组',exact:true});await dialog.getByRole('textbox',{name:'名称'}).fill('新增研究');await dialog.getByRole('button',{name:'保存',exact:true}).click();await expect(group).toContainText('新增研究');
 const parent=relations.getByRole('combobox',{name:'父任务',exact:true});await parent.click();await page.getByRole('searchbox',{name:'搜索父任务'}).fill('资料甲');await page.getByRole('option',{name:'参考资料甲',exact:true}).click();await expect(parent).toContainText('参考资料甲');
 const dep=relations.getByRole('combobox',{name:'前置任务',exact:true});await dep.click();await page.getByRole('searchbox',{name:'搜索前置任务'}).fill('资料乙');await page.getByRole('option',{name:'前置资料乙',exact:true}).click();await expect(relations.getByRole('button',{name:'前置资料乙',exact:true})).toBeVisible();
 const lists=org.getByRole('combobox',{name:'清单',exact:true});await lists.click();await page.getByRole('searchbox',{name:'搜索清单'}).fill('收集箱');await page.getByRole('option',{name:'收集箱',exact:true}).click();await expect(group).toContainText('新增研究');await lists.click();await page.getByRole('searchbox',{name:'搜索清单'}).fill('专业');await page.getByRole('option',{name:'专业研究',exact:true}).click();
 await expect(lists).toContainText('专业研究');await expect(group).toContainText('未分组');
 await page.screenshot({path:'test-results/detail-search-select.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await group.click();await expect(search).toBeVisible();await search.press('Escape');
});

test('八区两档折叠、草稿、计时及排序刷新偏好',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 const detail=page.locator('.detail-content'),plan=detail.locator('[data-detail-section=plan]'),notes=detail.locator('[data-detail-section=notes]'),check=detail.locator('[data-detail-section=checklist]');
 const toggle=card=>card.locator('.detail-section-toggle'),cards=detail.locator('[data-detail-section]');
 const order=()=>cards.evaluateAll(els=>els.map(el=>el.dataset.detailSection));
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
 const before=await stored();
 await toggle(plan).click();await expect(plan).toHaveAttribute('data-density','title');await expect(plan.locator('.detail-section-body')).toBeHidden();
 await expect(plan.getByRole('spinbutton',{name:'预计分钟'})).toHaveCount(0);
 await expect(notes).toHaveAttribute('data-density','full');
 await check.getByRole('textbox',{name:'新检查项'}).fill('尚未提交');
 await toggle(check).click();await toggle(check).click();await expect(check.getByRole('textbox',{name:'新检查项'})).toHaveValue('尚未提交');
 for(const card of await cards.all())if(await card.getAttribute('data-density')==='full')await toggle(card).click();
 const initial=await order(),first=cards.nth(0),third=cards.nth(2);
 await first.hover();const handle=first.locator('.detail-section-drag');const h=await handle.boundingBox(),t=await third.boundingBox();
 await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2,t.y+t.height/2,{steps:15});
 await expect(first).toHaveAttribute('data-dragging','true');await page.mouse.up();
 const moved=[initial[1],initial[2],initial[0],...initial.slice(3)];
 await expect.poll(order).toEqual(moved);await expect.poll(()=>cards.evaluateAll(els=>els.every(el=>!el.style.transform))).toBe(true);
 // A pointer drag can be cancelled without saving a new order.
 await cards.nth(0).hover();const cancelHandle=cards.nth(0).locator('.detail-section-drag'),ch=await cancelHandle.boundingBox(),ct=await cards.nth(1).boundingBox();await page.mouse.move(ch.x+ch.width/2,ch.y+ch.height/2);await page.mouse.down();await page.mouse.move(ch.x+ch.width/2,ct.y+ct.height/2,{steps:10});await page.keyboard.press('Escape');await page.mouse.up();await expect.poll(order).toEqual(moved);
 await expect.poll(async()=>(await stored()).tasks).toEqual(before.tasks);
 await page.reload();await page.locator('[data-view-key=inbox]').click();await page.locator('.task-body').filter({hasText:'分区验收'}).click();
 await expect.poll(order).toEqual(moved);await expect(plan).toHaveAttribute('data-density','title');await expect(notes).toHaveAttribute('data-density','title');
 await toggle(plan).click();await expect(plan.getByRole('spinbutton',{name:'预计分钟'})).toHaveValue('30');
 const focus=plan.getByRole('group',{name:'任务内专注'});await focus.getByRole('button',{name:'开始正计时'}).click();
 await toggle(plan).click();await expect.poll(async()=>(await stored()).timer?.mode).toBe('stopwatch');
 await toggle(plan).click();await expect(focus.getByRole('button',{name:'暂停当前专注'})).toBeVisible();
 await focus.getByRole('button',{name:'结束并保存专注'}).click();
 await page.screenshot({path:'test-results/detail-sort-desktop.png',animations:'disabled'});
});

test('移动端折叠计划后快捷安排和专注自动展开',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page);
 const detail=page.locator('.detail-content'),plan=detail.locator('[data-detail-section=plan]'),quick=page.getByRole('navigation',{name:'详情快捷操作'}),toggle=plan.locator('.detail-section-toggle');
 await toggle.click();await expect(plan).toHaveAttribute('data-density','title');
 await quick.getByRole('button',{name:'安排',exact:true}).click();await expect(plan).toHaveAttribute('data-density','full');
 const picker=page.getByRole('dialog',{name:'计划日期选择器'});await expect(picker).toBeVisible();await page.keyboard.press('Escape');await expect(picker).toHaveCount(0);
 await toggle.click();await expect(plan).toHaveAttribute('data-density','title');
 await quick.getByRole('button',{name:'专注',exact:true}).click();await expect(plan).toHaveAttribute('data-density','full');await expect(plan.getByRole('button',{name:'开始正计时'})).toBeFocused();
 await expect.poll(()=>detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await toggle.click();await page.screenshot({path:'test-results/detail-density-mobile.png',animations:'disabled'});
});

test('混合高度卡片拖动、键盘排序与移动导航顺序一致',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 const detail=page.locator('.detail-content'),cards=detail.locator('[data-detail-section]'),plan=detail.locator('[data-detail-section=plan]'),org=detail.locator('[data-detail-section=organization]');
 const order=()=>cards.evaluateAll(els=>els.map(el=>el.dataset.detailSection));
 await plan.locator('.detail-section-toggle').click();await expect(org).toHaveAttribute('data-density','full');
 await plan.hover();const handle=plan.locator('.detail-section-drag'),h=await handle.boundingBox(),target=await org.boundingBox();
 await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2,target.y+target.height/2,{steps:18});await page.mouse.up();
 await expect.poll(async()=>(await order()).slice(0,2)).toEqual(['organization','plan']);
 await expect.poll(()=>cards.evaluateAll(els=>els.every(el=>!el.style.transform))).toBe(true);
 await expect(org.getByRole('combobox',{name:'优先级'})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 const nav=detail.getByRole('navigation',{name:'任务详情分区'});
 await expect(nav.getByRole('button').nth(0)).toHaveText('属性');await expect(nav.getByRole('button').nth(1)).toHaveText('计划');
 const k=plan.locator('.detail-section-drag');await k.focus();await k.press('ArrowUp');
 await expect.poll(async()=>(await order()).slice(0,2)).toEqual(['plan','organization']);
 await expect(nav.getByRole('button').nth(0)).toHaveText('计划');
 await expect.poll(()=>detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});

test('卡片拖动手柄完整位于外侧且标题对齐',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 const detail=page.locator('.detail-content'),card=detail.locator('[data-detail-section=checklist]'),handle=card.locator('.detail-section-drag');
 const geometry=()=>card.evaluate(el=>{const r=el.getBoundingClientRect(),h=el.querySelector('.detail-section-drag').getBoundingClientRect(),title=el.querySelector('.detail-section-title h3').getBoundingClientRect(),host=el.closest('.detail-content').getBoundingClientRect();return {outside:h.right<=r.left+1,within:h.left>=host.left-1,aligned:Math.abs((h.top+h.bottom-title.top-title.bottom)/2)<=2,titleInset:title.left-r.left}});
 await card.scrollIntoViewIfNeeded();await card.hover();
 const full=await geometry();expect(full.outside).toBe(true);expect(full.within).toBe(true);expect(full.aligned).toBe(true);
 await card.locator('.detail-section-toggle').click();const folded=await geometry();expect(folded.outside).toBe(true);expect(folded.aligned).toBe(true);expect(folded.titleInset).toBeCloseTo(full.titleInset,0);
 await handle.hover();await expect(handle).toHaveCSS('opacity','1');
 await page.screenshot({path:'test-results/detail-external-handle.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await card.scrollIntoViewIfNeeded();
 const mobile=await geometry();expect(mobile.outside).toBe(true);expect(mobile.within).toBe(true);expect(mobile.aligned).toBe(true);
 await expect.poll(()=>detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await expect(handle).toHaveCSS('width','44px');
});

test('搜索选择器保留百项之外的当前值与键盘确认',async({page})=>{
 const state=initialState(),today=dayKey(),task=newTask('大规模选择器验收','inbox',today);
 state.lists[0].sections=Array.from({length:125},(_,i)=>({id:'group-'+i,name:'分组 '+i}));
 task.sectionId='group-124';state.tasks=[task];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.locator('.task-body').filter({hasText:'大规模选择器验收'}).click();
 const group=page.locator('[data-detail-section=organization]').getByRole('combobox',{name:'分组',exact:true}),search=page.getByRole('searchbox',{name:'搜索分组'});
 await group.click();await expect(page.getByRole('option')).toHaveCount(100);
 const selected=page.getByRole('option',{name:'分组 124',exact:true});await expect(selected).toHaveAttribute('aria-selected','true');
 await expect(search).toHaveAttribute('aria-activedescendant',await selected.getAttribute('id'));
 await search.press('Enter');await expect(group).toContainText('分组 124');
 await group.click();await search.fill('分组 120');await expect(page.getByRole('option')).toHaveCount(1);
 await search.press('Enter');await expect(group).toContainText('分组 120');
 await group.click();await search.fill('不存在');await expect(page.getByRole('option')).toHaveCount(0);
 await search.press('Enter');await expect(search).toBeVisible();await search.press('Escape');await expect(group).toContainText('分组 120');
});
