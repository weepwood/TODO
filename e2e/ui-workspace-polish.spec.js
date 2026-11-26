import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
const dir='test-results/workspace-polish';
async function seed(page,theme='light'){
 const d=initialState(),today=dayKey();d.theme=theme;d.tasks=[{...newTask('今日执行验收任务','inbox',today,'active'),time:'09:00',deadline:today},...Array.from({length:10},(_,i)=>({...newTask('历史完成 '+i,'inbox',shiftDay(today,-i),'done'+i),status:'completed',completedAt:new Date(shiftDay(today,-i)+'T12:00:00').toISOString()}))];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();mkdirSync(dir,{recursive:true});
}
async function shot(page,name){await page.screenshot({path:dir+'/'+name+'.png',animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)}
test('面板拖动取消恢复原宽度，下一次拖动正常提交',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 const handle=page.getByRole('separator',{name:'调整清单栏宽度'}),original=Number(await handle.getAttribute('aria-valuenow'));const r=await handle.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+40,r.y+r.height/2,{steps:5});await expect.poll(async()=>Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(original);
 await handle.evaluate(el=>el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1})));await page.mouse.up();await expect(handle).toHaveAttribute('aria-valuenow',String(original));
 const b=await handle.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+24,b.y+b.height/2,{steps:5});await page.mouse.up();await expect(handle).toHaveAttribute('aria-valuenow',String(original+24));await expect(page.locator('body')).not.toHaveClass(/resizing-panels/);
});
test('统计90天保留全部真实数据，长趋势可滚动且零值不伪造',async({page})=>{
 await page.setViewportSize({width:1024,height:768});await seed(page,'dark');await page.locator('.rail').getByRole('button',{name:'统计',exact:true}).click();await page.getByRole('combobox',{name:'统计区间'}).click();await page.getByRole('option',{name:'近 90 天'}).click();const scroll=page.getByRole('region',{name:'完成趋势滚动区域'}),bars=scroll.locator('.bars');await expect(bars.locator('>div')).toHaveCount(90);
 expect(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);await expect(bars).toHaveAttribute('aria-label',/0项/);expect(await bars.locator('i').evaluateAll(els=>els.some(el=>el.style.height==='0px'))).toBe(true);await scroll.evaluate(el=>el.scrollLeft=el.scrollWidth);expect(await scroll.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);await shot(page,'stats-90-dark');
});
test('设置实时预览跟随真实密度和主题',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'reduce'});await seed(page);await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'外观与布局'}).click();
 const preview=page.getByLabel('当前外观预览');await expect(preview).toBeVisible();for(const [label,height] of [['紧凑',42],['舒展',56]]){await page.getByRole('combobox',{name:'控件密度'}).click();await page.getByRole('option',{name:label,exact:true}).click();await expect(preview.locator('.appearance-preview-row').first()).toHaveCSS('min-height',height+'px')}
 await page.getByRole('button',{name:'深色',exact:true}).click();await expect(preview.locator('.appearance-preview-action')).toHaveCSS('color','rgb(20, 24, 32)');await preview.scrollIntoViewIfNeeded();await shot(page,'settings-preview-dark');
});
test('极窄今日执行与捕获区不挤压输入',async({page})=>{
 await page.setViewportSize({width:320,height:844});await seed(page);await page.getByRole('navigation',{name:'移动端主导航'}).getByRole('button',{name:'任务',exact:true}).click();const execution=page.getByRole('region',{name:'今日执行',exact:true});await expect(execution).toBeVisible();await expect(execution.locator('.today-execution-meta')).toContainText('截止风险');await execution.getByRole('button',{name:'展开执行清单'}).click();await expect(execution.locator('.today-execution-item').first()).toBeVisible();const input=page.getByRole('textbox',{name:'新任务名称'});expect((await input.boundingBox()).width).toBeGreaterThan(100);await shot(page,'today-320');
});
