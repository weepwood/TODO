import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
async function seed(page){
 const state=initialState();
 state.tasks=['任务3','任务1','任务2','任务4'].map(title=>newTask(title,'inbox',dayKey()));
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(data))},state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');
 await page.locator('[data-view-key=inbox]').click();
}
test('桌面无复选框，Shift范围与Ctrl非连续选择，单击清空批量状态',async({page})=>{
 await seed(page);
 const rows=page.locator('.task-row'),body=i=>rows.nth(i).locator('.task-body');
 await expect(rows.locator('.multi-toggle')).toHaveCount(0);
 await body(0).click();await body(2).click({modifiers:['Shift']});
 await expect(page.locator('.task-row.checked')).toHaveCount(3);
 await body(1).click({modifiers:['ControlOrMeta']});
 await expect(page.locator('.task-row.checked')).toHaveCount(2);
 await body(3).click({modifiers:['ControlOrMeta']});
 await expect(page.locator('.task-row.checked')).toHaveCount(3);
 await page.screenshot({path:'test-results/desktop-multiselect.png',animations:'disabled'});
 await body(0).click();await expect(page.locator('.task-row.checked')).toHaveCount(0);
 await expect(page.locator('.bulk-bar')).toBeHidden();
});
test('浮动手柄在卡片之外且实际手动拖动，二级菜单排序分组顺序',async({page})=>{
 await seed(page);
 const rows=page.locator('.task-row'),row=rows.first(),handle=row.locator('.drag-handle');
 await row.hover();await expect(handle).toHaveCSS('opacity','1');
 const a=await handle.boundingBox(),b=await row.boundingBox(),target=await rows.nth(2).boundingBox();
 expect(a.x+a.width).toBeLessThanOrEqual(b.x+1);
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
 await expect(handle).toHaveCSS('opacity','1');await expect(handle).toHaveCSS('cursor','grab');
 await page.screenshot({path:'test-results/desktop-floating-drag.png',animations:'disabled'});
 await page.mouse.down();await page.mouse.move(target.x+20,target.y+target.height-4,{steps:15});await page.mouse.up();
 await expect(rows.nth(2).locator('.task-body')).toContainText('任务3');
 const menu=page.getByRole('button',{name:'分组、排序与顺序'});
 const choose=async(label,value)=>{await menu.click();await page.getByRole('menuitem',{name:new RegExp('^'+label)}).hover();await page.getByRole('menuitemradio',{name:value,exact:true}).click()};
 await menu.click();await expect(page.getByRole('menuitem',{name:/^顺序/})).toHaveAttribute('aria-disabled','true');
 await page.screenshot({path:'test-results/desktop-view-menu.png',animations:'disabled'});
 await page.keyboard.press('Escape');
 await choose('排序','标题');await expect(rows.first().locator('.task-body')).toContainText('任务1');
 await expect(rows.locator('.drag-handle')).toHaveCount(0);
 await choose('顺序','降序');await expect(rows.first().locator('.task-body')).toContainText('任务4');
 await choose('分组','清单');await expect(page.locator('.list-caption')).toContainText('收集箱');
});

test('拖拽落位后不重复播放列表重排，普通完成仍有动画',async({page})=>{
 await page.addInitScript(()=>{
  const original=Element.prototype.animate;window.__sortMotions=[];
  Element.prototype.animate=function(...args){if(this.matches('.task-row')&&args[0]?.[0]?.translate)window.__sortMotions.push({id:this.dataset.rowId,from:args[0][0].translate});return original.apply(this,args)};
 });
 await seed(page);
 const rows=page.locator('.task-row'),source=rows.first(),handle=source.locator('.drag-handle');
 await source.hover();await expect(handle).toHaveCSS('opacity','1');
 const a=await handle.boundingBox(),target=await rows.nth(2).boundingBox();
 const ids=await rows.evaluateAll(els=>els.map(e=>e.dataset.rowId));
 const initial=await rows.evaluateAll(els=>els.map(e=>e.getBoundingClientRect().y));
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
 await page.mouse.move(a.x+a.width/2,target.y+target.height/2,{steps:15});
 await expect(source).toHaveAttribute('data-dragging','true');
 // Wait for the neighbouring rows to finish the sorting strategy's displacement.
 const neighbour=i=>page.locator('[data-row-id="'+ids[i]+'"]');
 for(const i of [1,2])await expect.poll(async()=>Math.abs((await neighbour(i).boundingBox()).y-initial[i-1])).toBeLessThan(2);
 // Record the rendered positions from release through the animation window.
 await page.evaluate(({ids,initial})=>{window.__dropFrames=[];window.__dropDone=false;const start=performance.now();function frame(){window.__dropFrames.push(ids.slice(1,3).map((id,i)=>Math.abs(document.querySelector('[data-row-id="'+id+'"]').getBoundingClientRect().y-initial[i])));if(performance.now()-start<320)requestAnimationFrame(frame);else window.__dropDone=true}requestAnimationFrame(frame)},{ids,initial});
 await page.evaluate(()=>{window.__sortMotions=[]});
 await page.mouse.up();
 await expect.poll(()=>rows.evaluateAll(els=>els.map(e=>e.dataset.rowId))).toEqual([ids[1],ids[2],ids[0],ids[3]]);
 expect(await page.evaluate(()=>window.__sortMotions)).toEqual([]);
 await expect.poll(()=>page.evaluate(()=>window.__dropDone)).toBe(true);
 expect(await page.evaluate(()=>window.__dropFrames.length)).toBeGreaterThan(5);
 expect(await page.evaluate(()=>Math.max(...window.__dropFrames.flat()))).toBeLessThan(4);
 await page.getByRole('button',{name:'完成 任务1',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__sortMotions.length)).toBeGreaterThan(0);
});

test('键盘排序与取消拖拽后正常恢复普通重排',async({page})=>{
 await page.addInitScript(()=>{const original=Element.prototype.animate;window.__sortMotions=0;Element.prototype.animate=function(...args){if(this.matches('.task-row')&&args[0]?.[0]?.translate)window.__sortMotions++;return original.apply(this,args)}});
 await seed(page);
 const rows=page.locator('.task-row'),handle=page.getByRole('button',{name:'拖动 任务3',exact:true});
 const ids=await rows.evaluateAll(els=>els.map(e=>e.dataset.rowId));
 await handle.focus();await page.keyboard.press('Space');await expect(page.locator('[data-row-id="'+ids[0]+'"]')).toHaveAttribute('data-dragging','true');
 // KeyboardSensor installs its document listener on the next event-loop turn.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');await expect(page.locator('[data-dragging=true]')).toHaveCount(0);
 expect(await rows.evaluateAll(els=>els.map(e=>e.dataset.rowId))).toEqual(ids);
 await handle.focus();await page.keyboard.press('Space');await expect(page.locator('[data-row-id="'+ids[0]+'"]')).toHaveAttribute('data-dragging','true');
 // KeyboardSensor installs its document listener on the next event-loop turn.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.keyboard.press('ArrowDown');
 await expect.poll(()=>page.locator('[role=status]').allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining('over droppable area '+ids[1])]));
 await page.keyboard.press('Space');
 await expect.poll(()=>rows.evaluateAll(els=>els.map(e=>e.dataset.rowId))).toEqual([ids[1],ids[0],ids[2],ids[3]]);
 expect(await page.evaluate(()=>window.__sortMotions)).toBe(0);
 await page.getByRole('button',{name:'完成 任务1',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__sortMotions)).toBeGreaterThan(0);
});

for(const [width,theme] of [[1440,'light'],[1440,'dark'],[390,'light']])test('轻量任务录入与无分隔线分组 '+width+' '+theme,async({page})=>{
 const state=initialState();state.theme=theme;state.tasks=['阅读','学习','整理资料'].map(title=>newTask(title,'inbox',dayKey()));
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),state);
 await page.setViewportSize({width,height:900});await page.goto('/');
 if(width<861)await page.getByRole('button',{name:'打开导航',exact:true}).click();
 await page.locator('[data-view-key=inbox]').click();
 const capture=page.locator('.task-capture-toolbar'),form=capture.locator('form'),sort=capture.getByRole('button',{name:'分组、排序与顺序'});
 await expect(form).toBeVisible();await expect(sort).toBeVisible();
 await expect(page.locator('.heading .workspace-title')).toHaveCSS('width','1px');
 await expect(page.locator('.list-caption').first()).toHaveCSS('border-bottom-width','0px');
 await expect(form).toHaveCSS('box-shadow','none');
 const a=await form.boundingBox(),b=await sort.boundingBox();expect(b.x).toBeGreaterThanOrEqual(a.x+a.width);expect(Math.abs(b.y+b.height/2-a.y-a.height/2)).toBeLessThan(2);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/quiet-task-'+width+'-'+theme+'.png',animations:'disabled'});
 await sort.click();await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');
 await form.getByRole('textbox',{name:'新任务名称'}).fill('新任务');await form.getByRole('button',{name:'添加',exact:true}).click();await expect(page.locator('.task-body').filter({hasText:'新任务'})).toBeVisible();
});

test('右键快捷日期、优先级、标签、状态及更多菜单一致',async({page})=>{
 const state=initialState(),task=newTask('右键操作测试','inbox',dayKey());state.tasks=[task];state.tags=[{id:'menu-tag',name:'工作标签',color:'#5276d6'}];
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.locator('[data-view-key=inbox]').click();
 const row=page.locator('.task-row'),open=async()=>{await row.locator('.task-body').click({button:'right'});await expect(page.locator('.task-action-menu[data-state=open]')).toBeVisible()};
 const menu=page.locator('.task-action-menu[data-state=open]'),item=name=>menu.getByRole('menuitem',{name,exact:true}),stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks[0]);
 await open();await expect(menu.locator('.menu-quick-grid').first().getByRole('menuitem')).toHaveCount(5);
 await expect(item('今天').locator('.menu-action-label')).toBeHidden();await expect(item('高优先级').locator('.menu-action-label')).toBeHidden();
 await expect(item('下一个周期')).toHaveAttribute('title','下一个周期（7天后）');
 await page.screenshot({path:'test-results/task-context-menu-icons.png',animations:'disabled'});
 await item('高优先级').click();await expect.poll(async()=>(await stored()).priority).toBe(3);
 await open();await item('明天').click();await expect.poll(async()=>(await stored()).date).not.toBe(dayKey());
 await open();await item('标签').hover();await page.getByRole('menuitem',{name:'工作标签',exact:true}).click();await expect.poll(async()=>(await stored()).tags).toEqual(['menu-tag']);
 await open();await item('状态').hover();await page.getByRole('menuitem',{name:'进行中',exact:true}).click();await expect.poll(async()=>(await stored()).stage).toBe('doing');
 await row.hover();await row.getByRole('button',{name:'任务操作 右键操作测试'}).click();await expect(item('高优先级')).toHaveAttribute('data-checked','true');await item('清除日期').click();await expect.poll(async()=>(await stored()).date).toBe('');
 await open();await item('选择日期').click();
 const dateDialog=page.getByRole('dialog',{name:'选择日期'});await expect(dateDialog).toBeVisible();
 await dateDialog.getByText('手动输入日期',{exact:true}).click();
 await dateDialog.getByRole('textbox',{name:'计划日期直接输入'}).fill('2027-01-15');
 await dateDialog.getByRole('button',{name:'应用',exact:true}).click();await expect.poll(async()=>(await stored()).date).toBe('');
 await dateDialog.getByRole('button',{name:'确定',exact:true}).click();await expect.poll(async()=>(await stored()).date).toBe('2027-01-15');
 await expect(dateDialog).toHaveCount(0);
 await open();await item('下一个周期').click();await expect.poll(async()=>(await stored()).date).toBe(await page.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+7);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}));
 await open();await item('移动到清单').click();await expect(page.getByRole('dialog',{name:'移动任务'})).toBeVisible();
});

for(const [width,theme] of [[1440,'light'],[390,'dark'],[320,'light']])test('日期弹窗月历布局与确认取消 '+width+' '+theme,async({page})=>{
 const state=initialState(),task=newTask('日历确认测试','inbox','2027-01-15');state.tasks=[task];state.theme=theme;
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),state);
 await page.setViewportSize({width,height:900});await page.goto('/');
 if(width<861)await page.getByRole('button',{name:'打开导航',exact:true}).click();
 await page.locator('[data-view-key=inbox]').click();
 const row=page.locator('.task-row'),open=async()=>{if(width<861)await row.getByRole('button',{name:'任务操作 日历确认测试'}).click();else await row.locator('.task-body').click({button:'right'});await page.locator('.task-action-menu[data-state=open]').getByRole('menuitem',{name:'选择日期',exact:true}).click()};
 const dialog=page.getByRole('dialog',{name:'选择日期'}),stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks[0].date);
 await open();await expect(dialog).toBeVisible();await expect(dialog.locator('.date-month-toolbar strong')).toHaveText('2027年1月');
 await expect(dialog.locator('.rdp-month_grid')).toBeVisible();
 await expect(dialog.locator('.rdp-selected .rdp-day_button')).toHaveText('15');
 await expect.poll(()=>dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:'test-results/task-date-'+width+'-'+theme+'.png',animations:'disabled'});
 await dialog.getByRole('button',{name:'下个月',exact:true}).click();await expect(dialog.locator('.date-month-toolbar strong')).toHaveText('2027年2月');
 await dialog.getByRole('button',{name:'上个月',exact:true}).click();await dialog.locator('[data-day="2027-01-20"] button').click();await expect(dialog.locator('.rdp-selected .rdp-day_button')).toHaveText('20');expect(await stored()).toBe('2027-01-15');
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(dialog).toHaveCount(0);expect(await stored()).toBe('2027-01-15');
 await open();await dialog.locator('[data-day="2027-01-20"] button').click();await dialog.getByRole('button',{name:'确定',exact:true}).click();await expect.poll(stored).toBe('2027-01-20');
 await open();await dialog.getByRole('button',{name:'清除',exact:true}).click();await expect.poll(stored).toBe('');
});

test('月份年份导航及时间提醒重复统一暂存确认',async({page})=>{
 const state=initialState(),task=newTask('安排面板测试','inbox','2027-01-15');state.tasks=[task];
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),state);
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await page.locator('[data-view-key=inbox]').click();
 const open=async()=>{await page.locator('.task-body').click({button:'right'});await page.locator('.task-action-menu[data-state=open]').getByRole('menuitem',{name:'选择日期',exact:true}).click()};
 const dialog=page.getByRole('dialog',{name:'选择日期'}),stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks[0]);
 await open();await dialog.getByRole('button',{name:'选择月份',exact:true}).click();
 await expect(dialog.getByRole('group',{name:'选择月份'}).getByRole('button')).toHaveCount(12);
 await dialog.getByRole('button',{name:'下一年',exact:true}).click();
 await expect(dialog.locator('.date-month-toolbar strong')).toHaveText('2028年');
 await page.screenshot({path:'test-results/schedule-month-grid.png',animations:'disabled'});
 const now=await page.evaluate(()=>{const d=new Date();return {year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate()}});
 await dialog.getByRole('button',{name:'返回当前月份',exact:true}).click();
 await expect(dialog.locator('.date-month-toolbar strong')).toHaveText(now.year+'年');
 await expect(dialog.getByRole('button',{name:now.month+'月',exact:true})).toHaveAttribute('aria-pressed','true');
 expect((await stored()).date).toBe('2027-01-15');
 await dialog.getByRole('button',{name:now.month+'月',exact:true}).click();
 await dialog.getByRole('button',{name:'回到今天',exact:true}).click();
 await expect(dialog.locator('.rdp-selected .rdp-day_button')).toHaveText(String(now.day));
 expect((await stored()).date).toBe('2027-01-15');
 await dialog.getByRole('button',{name:'选择月份',exact:true}).click();
 for(let y=now.year;y<2028;y++)await dialog.getByRole('button',{name:'下一年',exact:true}).click();
 for(let y=now.year;y>2028;y--)await dialog.getByRole('button',{name:'上一年',exact:true}).click();
 await dialog.getByRole('button',{name:'2月',exact:true}).click();
 await expect(dialog.locator('.date-month-toolbar strong')).toHaveText('2028年2月');
 await dialog.locator('[data-day="2028-02-20"] button').click();
 await dialog.getByRole('button',{name:'时间',exact:true}).hover();
 const fly=page.locator('.schedule-flyout[data-state=open]');
 await expect(fly).toBeVisible();await expect(dialog.locator('.rdp-month_grid')).toBeVisible();
 const parent=await dialog.boundingBox(),side=await fly.boundingBox();expect(side.x).toBeGreaterThanOrEqual(parent.x+parent.width-2);
 await expect.poll(()=>fly.locator('.time-control').evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBe(true);
 await expect(fly.getByRole('button',{name:'23时',exact:true})).toBeInViewport();
 await page.screenshot({path:'test-results/schedule-side-time.png',animations:'disabled'});
 await fly.getByRole('button',{name:'10时',exact:true}).click();await fly.getByRole('button',{name:'00分',exact:true}).click();
 await expect(fly.getByRole('textbox',{name:'计划时间',exact:true})).toHaveValue('10:00');
 await dialog.getByRole('button',{name:'提醒',exact:true}).hover();
 await fly.getByRole('button',{name:'提前 5 分钟',exact:true}).click();
 await dialog.getByRole('button',{name:'重复',exact:true}).hover();
 const ruleLabel=fly.locator('.field>span').first();
 await expect(ruleLabel).toHaveCSS('white-space','nowrap');
 await expect.poll(()=>ruleLabel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await fly.getByRole('combobox',{name:'重复规则'}).click();
 const dropdown=page.locator('.smart-select-content[data-state=open]');
 await expect(dropdown).toBeVisible();
 await expect.poll(()=>dropdown.evaluate(el=>Number(getComputedStyle(el.closest('[data-radix-popper-content-wrapper]')).zIndex)>Number(getComputedStyle(document.querySelector('.schedule-flyout[data-state=open]').closest('[data-radix-popper-content-wrapper]')).zIndex))).toBe(true);
 await page.screenshot({path:'test-results/schedule-repeat-layer.png',animations:'disabled'});
 await page.getByRole('option',{name:'每周',exact:true}).click();
 await expect(dialog.locator('.rdp-month_grid')).toBeVisible();
 await expect(fly).toContainText('重复规则');
 expect((await stored()).date).toBe('2027-01-15');expect((await stored()).time).toBe('');
 await page.screenshot({path:'test-results/schedule-combined.png',animations:'disabled'});
 await dialog.getByRole('button',{name:'确定',exact:true}).click();
 await expect.poll(async()=>{const t=await stored();return [t.date,t.time,t.reminderAt,t.repeat,t.seriesStart]}).toEqual(['2028-02-20','10:00','2028-02-20T09:55','weekly','2028-02-20']);
});
