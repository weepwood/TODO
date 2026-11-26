import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
const dir='test-results/business-polish';test.use({reducedMotion:'reduce'});
async function seed(page,theme='light'){
 const d=initialState();d.theme=theme;d.tasks=[{...newTask('业务排版验收','inbox',dayKey(),'a'),time:'09:00',duration:60}];d.habits=[{id:'habit',name:'每日阅读与知识整理',days:[dayKey()],weeklyGoal:5,includeInPlan:true}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();mkdirSync(dir,{recursive:true});
}
async function shot(page,name){await page.screenshot({path:dir+'/'+name+'.png',animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)}
test('业务工作台实际宽度、统计顺序与专注双列',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 await page.locator('.rail').getByRole('button',{name:'专注',exact:true}).click();
 const card=page.locator('.focus-card'),ring=card.locator('.timer-ring'),setup=card.locator('.focus-card-setup');await expect(card).toBeVisible();await expect(card).toHaveCSS('display','grid');expect((await setup.boundingBox()).x).toBeGreaterThan((await ring.boundingBox()).x+(await ring.boundingBox()).width);await shot(page,'focus-wide');
 await page.locator('.rail').getByRole('button',{name:'习惯',exact:true}).click();const habit=page.locator('.habit-row').first();await expect(habit).toHaveCSS('display','grid');await shot(page,'habit-wide');
 await page.locator('.rail').getByRole('button',{name:'统计',exact:true}).click();const toolbar=page.locator('.stats-toolbar');await expect(toolbar).toBeVisible();expect(await toolbar.locator('.stats-filter-group').evaluate(el=>el.nextElementSibling.classList.contains('stats-jump'))).toBe(true);await shot(page,'stats-wide');
 await page.setViewportSize({width:1024,height:768});await shot(page,'stats-1024');await page.locator('.rail').getByRole('button',{name:'习惯',exact:true}).click();await expect(habit).toBeVisible();await shot(page,'habit-1024');
});
test('明暗强调色与辅助文字实际计算对比度',async({page})=>{
 await seed(page);const ratios=await page.evaluate(()=>{
 const root=document.documentElement,oldTheme=root.dataset.theme,oldAccent=root.dataset.accent,rows=[];
 const lum=hex=>{let c=hex.trim().replace('#','');if(c.length===3)c=[...c].map(v=>v+v).join('');const n=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return n[0]*.2126+n[1]*.7152+n[2]*.0722};
 const ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 for(const theme of ['light','dark'])for(const accent of ['blue','teal','violet','rose','slate']){root.dataset.theme=theme;root.dataset.accent=accent;const style=getComputedStyle(root),v=k=>style.getPropertyValue(k);rows.push({theme,accent,primary:ratio(v('--accent'),v('--accent-contrast')),muted:ratio(v('--muted'),v('--panel'))})}root.dataset.theme=oldTheme;root.dataset.accent=oldAccent;return rows;
 });for(const row of ratios){expect(row.primary,JSON.stringify(row)).toBeGreaterThanOrEqual(4.5);expect(row.muted,JSON.stringify(row)).toBeGreaterThanOrEqual(4.5)}
});
for(const [width,height] of [[1440,900],[390,640]])test('复杂工作周弹窗固定标题与底部操作 '+width,async({page})=>{
 await page.setViewportSize({width,height});await seed(page,'dark');
 if(width<861){await page.getByRole('navigation',{name:'移动端主导航'}).getByRole('button',{name:'每日规划',exact:true}).click();await page.getByRole('button',{name:/^规划设置/}).click()}else await page.locator('.rail').getByRole('button',{name:'每日规划',exact:true}).click();
 await page.getByRole('button',{name:'工作周规划'}).click();const modal=page.getByRole('dialog',{name:'工作周与多日重排'}),body=modal.locator('.dialog-body'),head=modal.locator('.dialog-head'),footer=modal.locator('.dialog-actions');await expect(body).toBeVisible();
 const h=await head.boundingBox(),f=await footer.boundingBox();await body.evaluate(el=>el.scrollTop=el.scrollHeight);expect(Math.abs((await head.boundingBox()).y-h.y)).toBeLessThan(1);expect(Math.abs((await footer.boundingBox()).y-f.y)).toBeLessThan(1);expect(await modal.evaluate(el=>el.scrollTop)).toBe(0);
 await expect(footer.getByRole('button',{name:'预览多日重排'})).toBeVisible();await shot(page,'weekly-'+width);await modal.getByRole('button',{name:'关闭',exact:true}).click();await expect(modal).toHaveCount(0);
});
test('极窄屏专注操作和习惯创建同排',async({page})=>{
 await page.setViewportSize({width:320,height:844});await seed(page,'light');const nav=page.getByRole('navigation',{name:'移动端主导航'});
 const open=async name=>{await nav.getByRole('button',{name:'更多'}).click();await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name,exact:true}).click()};
 await open('专注');const card=page.locator('.focus-card'),start=card.getByRole('button',{name:'开始',exact:true});await expect(start).toBeVisible();const r=await start.boundingBox(),bottom=await nav.boundingBox();expect(r.y+r.height).toBeLessThanOrEqual(bottom.y+1);await shot(page,'focus-320');
 await open('习惯');const add=page.locator('.habits-view .quick-add'),selector=add.getByRole('combobox',{name:'每周目标天数'}),button=add.getByRole('button',{name:'添加',exact:true});expect(Math.abs((await selector.boundingBox()).y-(await button.boundingBox()).y)).toBeLessThan(2);await shot(page,'habit-320');
});
