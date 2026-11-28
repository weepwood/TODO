import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
const dir='test-results/module-card';
test.use({reducedMotion:'reduce'});
async function seed(page,width,design,theme){
 await page.setViewportSize({width,height:width>860?900:844});
 const d=initialState(),today=dayKey();d.theme=theme;d.habits=[{id:'fixture-habit',name:'阅读',days:[today],weeklyGoal:3}];d.tasks=[{...newTask('模块卡片验收','inbox',today),time:'09:00',duration:60},{...newTask('已完成记录','inbox',today),status:'completed',stage:'done',completedAt:today+'T12:00:00'}];
 await page.addInitScript(({d,design})=>{localStorage.setItem('todo-workbench-v1',JSON.stringify(d));localStorage.setItem('todo-appearance-v1',JSON.stringify({designTheme:design,accent:'blue'}))},{d,design});await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-design-theme',design);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 mkdirSync(dir,{recursive:true});
}
async function cards(page,selector){
 const nodes=page.locator(selector);await expect(nodes.first()).toBeVisible();
 const result=await nodes.evaluateAll(els=>{
  const probe=document.createElement('div');probe.style.background='var(--module-card-bg)';document.body.append(probe);
  const expected=getComputedStyle(probe).backgroundColor;probe.style.background='var(--bg)';const canvas=getComputedStyle(probe).backgroundColor;probe.remove();
  return {expected,canvas,items:els.filter(e=>e.getClientRects().length).map(e=>({class:e.className,bg:getComputedStyle(e).backgroundColor,shadow:getComputedStyle(e).boxShadow,border:getComputedStyle(e).borderTopWidth}))};
 });
 expect(result.expected).not.toBe(result.canvas);
 expect(result.items.length).toBeGreaterThan(0);
 for(const item of result.items){expect(item.bg,item.class).toBe(result.expected);expect(item.shadow,item.class).toBe('none');expect(item.border,item.class).toBe('1px')}
}
for(const [width,design,theme] of [[1440,'classic','light'],[1440,'native','light'],[390,'native','dark'],[320,'classic','dark']])test('设置子分组统一底纹 '+width+' '+design,async({page})=>{
 await seed(page,width,design,theme);
 if(width<=860){await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'设置',exact:true}).click()}else await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'设置与数据管理'}),nav=dialog.getByRole('navigation',{name:'设置分类'});
 for(const [label,id] of [['账号与同步','account'],['软件更新','updates'],['外观与布局','appearance'],['任务与清单','tasks'],['专注','focus'],['组件展厅','components'],['快捷键','shortcuts'],['本地数据','data'],['提醒','notifications']]){
  await nav.getByRole('button',{name:label,exact:true}).click();await expect(dialog.locator('.settings-section:visible')).toHaveCount(1);
  const selector='#settings-'+id+' '+(id==='components'?'.component-gallery>section':'.settings-section-body>:is(.settings-group,.account-panel,.settings-preference-sync,.appearance-settings,.list-defaults,.pomodoro-preferences,.shortcut-settings,.update-panel)');
  await cards(page,selector);expect(await dialog.locator('.settings-sections').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:dir+'/'+width+'-'+design+'-settings-'+id+'.png',animations:'disabled'});
 }
});
for(const [width,design,theme] of [[1440,'classic','light'],[390,'native','dark']])test('业务模块统一底纹 '+width+' '+design,async({page})=>{
 await seed(page,width,design,theme);
 if(width>860)await page.locator('[data-view-key=today]').click();await cards(page,'.today-execution');await page.screenshot({path:dir+'/'+width+'-'+design+'-today.png',animations:'disabled'});
 await page.locator('.task-body').first().click();await cards(page,'.detail-section-card');await page.screenshot({path:dir+'/'+width+'-'+design+'-detail.png',animations:'disabled'});
 await page.getByRole('button',{name:'关闭详情',exact:true}).click();await page.locator('.details').waitFor({state:'detached'});
 const mobile=width<=860;
 const open=async(label,key)=>{if(mobile&&!['日历','统计','每日规划'].includes(label)){await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name:label,exact:true}).click()}else if(key==='goals')await page.getByRole('button',{name:'打开目标管理',exact:true}).click();else if(key==='workflow')await page.getByText('自动化工作台',{exact:true}).first().click();else await page.getByRole('button',{name:label,exact:true}).first().click()};
 for(const [label,key,selector] of [['日历','calendar','.calendar-agenda'],['每日规划','planner','.planner .work-budget'],['统计','statistics','.stats .stat-card'],['专注','focus','.focus-card'],['看板','board','.board-column'],['四象限','matrix','.board-column'],['习惯','habits','.habit-row'],['目标管理','goals','.goal-panel-standalone'],['自动化工作台','workflow','.workflow-overview>div']]){
  await open(label,key);await cards(page,selector);if(key==='workflow'){await page.getByRole('button',{name:'添加规则',exact:true}).click();await cards(page,'.workflow-rule:visible');}expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:dir+'/'+width+'-'+design+'-'+key+'.png',animations:'disabled'});
 }
});
