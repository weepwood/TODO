import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
async function seed(page){
 const d=initialState(),today=dayKey(),inbox=d.lists.find(l=>l.id==='inbox');inbox.sections=[{id:'g1',name:'技术学习',color:'#5276d6'},{id:'g2',name:'日常',color:'#5276d6'}];
 d.tasks=Array.from({length:56},(_,i)=>({...newTask('验收任务 '+String(i).padStart(2,'0'),'inbox',today),sectionId:i<28?'g1':'g2'}));
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 await page.goto('/');await page.locator('[data-view-key=inbox]').click();
}
test('分组折叠、隐藏任务不参与批量操作、独立视图滚动恢复',async({page})=>{
 await seed(page);
 const fold=page.getByRole('button',{name:'折叠分组 技术学习'});
 await fold.click();await expect(page.getByRole('button',{name:'展开分组 技术学习'})).toBeVisible();await expect(page.locator('.task-row')).toHaveCount(28);
 // Select visible rows, then all visible tasks. Folded rows must never be included.
 await page.locator('.task-body').first().click({modifiers:['ControlOrMeta']});
 await page.getByRole('button',{name:'全选',exact:true}).click();
 await expect(page.locator('.bulk-bar')).toContainText('已选 28 项');
 await page.getByRole('spinbutton',{name:'批量任务积分'}).fill('7');
 await page.getByRole('button',{name:'设置积分',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>{const tasks=JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks;return [tasks.filter(t=>t.sectionId==='g1'&&Number(t.points||0)!==0).length,tasks.filter(t=>t.sectionId==='g2'&&Number(t.points)===7).length]})).toEqual([0,28]);
 await page.keyboard.press('Escape');
 const host=page.locator('.task-content');await host.evaluate(el=>el.scrollTop=500);
 await expect.poll(()=>host.evaluate(el=>el.scrollTop)).toBeGreaterThan(200);
 const before=await host.evaluate(el=>el.scrollTop);await expect.poll(()=>page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('todo-scroll-memory-v1')||'{}')).some(v=>v>=200))).toBe(true);
 await page.locator('[data-view-key=today]').click();await expect(page.locator('.task-row')).toHaveCount(56);
 await page.locator('[data-view-key=inbox]').click();await expect(page.locator('.task-row')).toHaveCount(28);
 await expect.poll(()=>host.evaluate((el,previous)=>Math.abs(el.scrollTop-previous),before)).toBeLessThan(3);
 await page.reload();await page.locator('[data-view-key=inbox]').click();await expect(page.locator('.task-row')).toHaveCount(28);
 await expect.poll(()=>host.evaluate((el,previous)=>Math.abs(el.scrollTop-previous),before)).toBeLessThan(3);
 await page.getByRole('button',{name:'展开分组 技术学习'}).click();await expect(page.locator('.task-row')).toHaveCount(56);
});
test('模块面板宽度独立保存与恢复',async({page})=>{
 await seed(page);
 const handle=page.getByRole('separator',{name:'调整清单栏宽度'});const original=await handle.getAttribute('aria-valuenow');
 await page.locator('.rail').getByRole('button',{name:'看板',exact:true}).click();await handle.focus();await page.keyboard.press('ArrowRight');
 const wider=String(Number(original)+16);await expect(handle).toHaveAttribute('aria-valuenow',wider);
 await page.locator('.rail').getByRole('button',{name:'任务',exact:true}).click();await expect(handle).toHaveAttribute('aria-valuenow',original);
 await page.locator('.rail').getByRole('button',{name:'看板',exact:true}).click();await expect(handle).toHaveAttribute('aria-valuenow',wider);
 await page.reload();await page.locator('.rail').getByRole('button',{name:'看板',exact:true}).click();await expect(handle).toHaveAttribute('aria-valuenow',wider);
});
test('展厅实际表单反馈、关联描述、深浅主题及重置',async({page})=>{
 await seed(page);
 await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'设置分类'});
 for(const [theme,label] of [['light','浅色'],['dark','深色']]){
  await nav.getByRole('button',{name:'外观与布局'}).click();await page.getByRole('button',{name:label,exact:true}).click();
  await nav.getByRole('button',{name:'组件展厅'}).click();const gallery=page.locator('.component-gallery');
  await expect(gallery.getByRole('alert')).toHaveCount(0);
  const name=gallery.getByRole('textbox',{name:'演示必填名称'});await name.fill('');await name.blur();
  await expect(name).toHaveAttribute('aria-invalid','true');await expect(name).toHaveAccessibleDescription('名称不能为空');
  await name.fill('示例');await expect(name).toHaveAccessibleDescription('名称有效');
  const draft=gallery.getByRole('spinbutton',{name:'演示数值草稿'});await draft.fill('181');await expect(draft).toHaveAttribute('aria-invalid','true');await expect(draft).toHaveAccessibleDescription('请输入 0 至 180 之间的整数');
  await page.screenshot({path:'test-results/gallery-feedback-'+theme+'.png',animations:'disabled'});
  await gallery.getByRole('button',{name:'重置演示'}).click();await expect(draft).toHaveValue('');await nav.getByRole('button',{name:'组件展厅'}).click();
  await page.screenshot({path:'test-results/gallery-governance-'+theme+'.png',animations:'disabled'});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
