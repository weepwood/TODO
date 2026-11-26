import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,STORAGE_KEY} from '../src/domain.js';
import {writeFileSync} from 'node:fs';
test('实际工作台页面检查',async({page})=>{
 const seed={...initialState(),tasks:[{...newTask('阅读与学习','inbox',dayKey(),'experience-1'),priority:3,notes:'合成备注'},newTask('整理工作资料','work',dayKey(),'experience-2'),newTask('完成日常计划','inbox',dayKey(),'experience-3')]};
 await page.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed))},{key:STORAGE_KEY,seed});
 const out=process.env.TODO_EXPERIENCE_EVIDENCE,rows=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 const inspect=async(name)=>{await page.waitForTimeout(120);const r=await page.evaluate(()=>{const pane=document.querySelector('.task-content');const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';return {heading:pane?.querySelector('h1')?.textContent,viewport:innerWidth,bodyWidth:document.documentElement.scrollWidth,paneWidth:pane?.clientWidth,paneScroll:pane?.scrollWidth,toolbar:[...document.querySelectorAll('.view-toolbar button')].filter(visible).map(b=>b.textContent||b.getAttribute('aria-label')),overflow:[...document.querySelectorAll('.task-content button,.task-content input,.task-content [role=combobox]')].filter(visible).filter(b=>{const x=b.getBoundingClientRect();return x.right>innerWidth+1||x.left< -1}).slice(0,15).map(b=>b.getAttribute('aria-label')||b.textContent),headings:[...pane.querySelectorAll('h2,h3')].filter(visible).slice(0,12).map(b=>b.textContent)}});rows.push({name,...r});if(out)await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});};
 await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();await inspect('desktop-tasks');
 await page.locator('[data-row-id="experience-1"]').click();await expect(page.locator('.detail-content[data-inspector=true]')).toBeVisible();await inspect('desktop-detail');
 const modules=[['任务','.task-capture-toolbar'],['日历','.calendar-main [role=tablist]'],['每日规划','.planner-toolbar'],['看板','.board-column'],['四象限','.board-column'],['专注','.focus-card'],['习惯','.habits-view'],['统计','.stats-toolbar']];
 for(const [label,selector] of modules.slice(1)){await page.locator('.rail').getByRole('button',{name:label,exact:true}).click();await expect(page.locator(selector).first()).toBeVisible();await inspect('desktop-'+label)}
 await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByRole('navigation',{name:'设置分类'})).toBeVisible();if(out)await page.screenshot({path:out+'/desktop-settings.png',animations:'disabled'});await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});
 const nav=page.getByRole('navigation',{name:'移动端主导航'}),more=page.getByRole('dialog',{name:'工作空间'});
 const primary=new Set(['任务','日历','每日规划','统计']);
 await expect(nav).toBeVisible();
 for(const [label,selector] of modules){
  // Do not infer primary membership from transient visibility during the sheet exit.
  if(primary.has(label)){const button=nav.getByRole('button',{name:label,exact:true});await expect(button).toBeVisible();await button.click();await expect(button).toHaveAttribute('aria-pressed','true')}
  else{await nav.getByRole('button',{name:'更多',exact:true}).click();await expect(more).toBeVisible();await more.getByRole('button',{name:label,exact:true}).click();await expect(more).toHaveCount(0)}
  await expect(page.locator(selector).first()).toBeVisible();await inspect('mobile-'+label)
 }
 if(out)writeFileSync(out+'/pages.json',JSON.stringify({rows,errors},null,2));console.log(JSON.stringify({rows,errors}));expect(errors).toEqual([]);expect(rows.every(r=>r.bodyWidth<=r.viewport+1)).toBe(true);
});
