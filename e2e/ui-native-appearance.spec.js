import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {normalizeAppearance} from '../src/appearance.jsx';
test('Native defaults preserve explicit appearance preferences',()=>{
 expect(normalizeAppearance({})).toMatchObject({designTheme:'classic',accent:'blue'});
 expect(normalizeAppearance({accent:'amber'})).toMatchObject({designTheme:'native',accent:'blue'});
 expect(normalizeAppearance({accent:'blue',density:'compact',font:'large'})).toMatchObject({accent:'blue',density:'compact',font:'large'});
});
for(const [width,theme] of [[1440,'light'],[390,'dark']])test('Native palette, compact controls, floating navigation '+width,async({page})=>{
 await page.setViewportSize({width,height:900});const d=initialState(),today=dayKey();d.theme=theme;d.tasks=[newTask('验收任务','inbox',today),{...newTask('完成记录','inbox',today),status:'completed',stage:'done',completedAt:today+'T12:00:00'}];
 await page.addInitScript(d=>{localStorage.setItem('todo-workbench-v1',JSON.stringify(d));localStorage.setItem('todo-appearance-v1',JSON.stringify({designTheme:'native',accent:'blue'}))},d);await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-accent','amber');await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 expect(await page.locator('html').evaluate(e=>getComputedStyle(e).getPropertyValue('--bg').trim().toLowerCase())).toBe(theme==='dark'?'#0b0b0d':'#f6f6f4');
 const bar=page.locator('.task-capture-toolbar');await expect(bar).toBeVisible();
 expect(await bar.locator('.task-view-trigger').evaluate(e=>getComputedStyle(e).borderRadius)).toBe('8px');
 if(width<860){const nav=page.getByRole('navigation',{name:'移动端主导航'});await expect(nav).toBeVisible();expect(await nav.evaluate(e=>getComputedStyle(e).borderRadius)).toBe('999px');expect((await nav.boundingBox()).x).toBeGreaterThan(0);}
 await page.getByRole('button',{name:'统计',exact:true}).click();await expect(page.locator('.stats .stat-card').first()).toBeVisible();
 expect(await page.locator('.stats .stat-card').first().evaluate(e=>getComputedStyle(e).borderRadius)).toBe('28px');
 await expect(page.locator('.task-completion-chart [data-current=true]')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('设置中切换双主题，保留原强调色并重载恢复',async({page})=>{
 const d=initialState();d.theme='light';d.tasks=[newTask('主题测试','inbox',dayKey())];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1')){localStorage.setItem('todo-workbench-v1',JSON.stringify(d));localStorage.setItem('todo-appearance-v1',JSON.stringify({accent:'violet',density:'compact',font:'large'}))}},d);
 await page.goto('/');const root=page.locator('html');
 await expect(root).toHaveAttribute('data-design-theme','classic');
 await expect(root).toHaveAttribute('data-accent','violet');
 await expect.poll(()=>root.evaluate(e=>getComputedStyle(e).getPropertyValue('--bg').trim())).toBe('#fff');
 const settings=async()=>{await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'外观与布局'}).click()};
 const choose=async(name)=>{await page.getByRole('combobox',{name:'设计主题'}).click();await page.getByRole('option',{name,exact:true}).click()};
 await settings();await choose('原生 · Native');
 await expect(root).toHaveAttribute('data-design-theme','native');await expect(root).toHaveAttribute('data-accent','amber');
 await expect(root).toHaveAttribute('data-density','compact');await expect(root).toHaveAttribute('data-font','large');
 await expect.poll(()=>root.evaluate(e=>getComputedStyle(e).getPropertyValue('--bg').trim())).toBe('#F6F6F4');
 await page.screenshot({path:'test-results/theme-switch/native-settings.png',animations:'disabled'});
 await page.reload();await expect(root).toHaveAttribute('data-design-theme','native');
 await settings();await choose('经典 · Classic');
 await expect(root).toHaveAttribute('data-accent','violet');await expect(root).toHaveAttribute('data-design-theme','classic');
 await expect.poll(()=>root.evaluate(e=>getComputedStyle(e).getPropertyValue('--bg').trim())).toBe('#fff');
 await expect(page.getByRole('button',{name:'鸢尾主题色'})).toHaveAttribute('aria-pressed','true');
 await page.screenshot({path:'test-results/theme-switch/classic-settings.png',animations:'disabled'});
 await page.reload();await expect(root).toHaveAttribute('data-design-theme','classic');await expect(root).toHaveAttribute('data-accent','violet');
});
test('两种主题独立响应系统明暗模式',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});const d=initialState();d.theme='system';
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),d);await page.goto('/');
 await expect(page.locator('html')).toHaveAttribute('data-theme','system');
 await expect(page.locator('html')).toHaveAttribute('data-design-theme','classic');
 const results=await page.evaluate(()=>{const r=document.documentElement,out=[];for(const design of ['classic','native']){r.dataset.designTheme=design;r.dataset.accent=design==='native'?'amber':'blue';out.push(getComputedStyle(r).getPropertyValue('--bg').trim().toLowerCase())}return out});
 expect(results).toEqual(['#202126','#0b0b0d']);
});
