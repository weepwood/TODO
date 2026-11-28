import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='test-results/continuous-disclosure';
async function seed(page,width=1440){
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
 const d=initialState(),today=dayKey();d.tasks=Array.from({length:5},(_,i)=>newTask('动效验收 '+i,'inbox',today));d.folders=[{id:'fixture-folder',name:'动效文件夹'}];d.lists.find(l=>l.id==='work').folderId='fixture-folder';
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),d);await page.goto('/');
 mkdirSync(dir,{recursive:true});
}
async function sampleGrid(page,button,open){
 await expect(button).toHaveAttribute('aria-expanded',String(open));
 const id=await button.getAttribute('aria-controls'),panel=page.locator('[id="'+id+'"]');
 // Collect actual intermediate layout and reverse while the transition is active.
 const samples=await button.evaluate((trigger,wasOpen)=>new Promise((resolve,reject)=>{
  const el=document.getElementById(trigger.getAttribute('aria-controls')),clip=el.firstElementChild;
  const start=el.getBoundingClientRect().height,full=clip.scrollHeight,t0=performance.now(),frames=[];
  trigger.click();
  let reversed=false,turn;
  function tick(now){
   const height=el.getBoundingClientRect().height;
   frames.push({ms:now-t0,height,inert:clip.inert});
   if(!reversed&&height>1&&height<full-1){
    turn=height;trigger.click();reversed=true;
   }
   if(reversed&&frames.length>4&&Math.abs(height-start)<1&&el.getAnimations().length===0){resolve({start,full,turn,frames});return}
   if(now-t0>1500){reject(Error('transition did not settle'));return}
   requestAnimationFrame(tick);
  }requestAnimationFrame(tick);
 }),open);
 expect(samples.turn).toBeGreaterThan(0);expect(samples.turn).toBeLessThan(samples.full);
 await expect(button).toHaveAttribute('aria-expanded',String(open));
 expect(await panel.locator('.shared-disclosure-clip').evaluate(e=>e.inert)).toBe(!open);
 return samples;
}
test('今日执行 Grid 原位开合、反向、无障碍与减少动效',async({page})=>{
 await seed(page);
 const panel=page.getByRole('region',{name:'今日执行'}),trigger=panel.locator('button[aria-expanded]').first();
 await expect(trigger).toHaveAttribute('aria-expanded','false');
 const samples=await sampleGrid(page,trigger,false);
 writeFileSync(dir+'/today-reversal.json',JSON.stringify(samples,null,2));
 await page.screenshot({path:dir+'/today-closed.png',animations:'disabled'});
 await trigger.click();await expect(panel.getByRole('button',{name:'全部',exact:true})).toBeVisible();
 await expect.poll(()=>panel.locator('.shared-disclosure').evaluate(e=>e.getAnimations().length)).toBe(0);
 await page.screenshot({path:dir+'/today-open.png',animations:'disabled'});
 await page.emulateMedia({reducedMotion:'reduce'});await trigger.click();
 await expect(panel.getByRole('button',{name:'全部',exact:true})).toHaveCount(0);
 expect(await panel.locator('.shared-disclosure').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(1);
});
test('文件夹原位收起、反向恢复及键盘操作',async({page})=>{
 await seed(page);const trigger=page.getByRole('button',{name:'动效文件夹',exact:true}),panel=page.locator('[id="folder-content-fixture-folder"]');
 const samples=await sampleGrid(page,trigger,true);
 writeFileSync(dir+'/folder-reversal.json',JSON.stringify(samples,null,2));
 await trigger.focus();await page.keyboard.press('Enter');await expect(trigger).toHaveAttribute('aria-expanded','false');
 await expect(panel.getByRole('button',{name:'工作',exact:true})).toHaveCount(0);
 await expect.poll(()=>panel.evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(1);
 await page.screenshot({path:dir+'/folder-closed.png',animations:'disabled'});
 await page.keyboard.press('Enter');await expect(panel.getByRole('button',{name:'工作',exact:true})).toBeVisible();
 await expect.poll(()=>panel.evaluate(e=>e.getAnimations().length)).toBe(0);
 await page.screenshot({path:dir+'/folder-open.png',animations:'disabled'});
});
test('详情弹簧反向保留草稿、收敛并释放内联高度',async({page})=>{
 await seed(page,390);await page.locator('.task-body').first().click();
 const card=page.locator('[data-detail-section=checklist]'),body=card.locator('.detail-section-body'),button=card.locator('.detail-section-toggle');
 await card.getByRole('textbox',{name:'新检查项'}).fill('未提交动效草稿');
 const frames=await card.evaluate(el=>new Promise((resolve,reject)=>{
  const b=el.querySelector('.detail-section-body'),t=el.querySelector('.detail-section-toggle'),initial=b.getBoundingClientRect().height,t0=performance.now(),out=[];
  t.click();let reversed=false;
  function tick(now){const h=b.getBoundingClientRect().height;out.push({ms:now-t0,height:h,inline:b.style.height,inert:b.inert});if(!reversed&&h<initial-2&&h>2){t.click();reversed=true}if(reversed&&!b.style.height&&!b.hidden){resolve(out);return}if(now-t0>2000){reject(Error('spring did not settle'));return}requestAnimationFrame(tick)}requestAnimationFrame(tick)
 }));
 writeFileSync(dir+'/detail-spring-reversal.json',JSON.stringify(frames,null,2));
 await expect(card.getByRole('textbox',{name:'新检查项'})).toHaveValue('未提交动效草稿');
 expect(await body.evaluate(e=>e.style.height)).toBe('');
 await page.screenshot({path:dir+'/detail-open.png',animations:'disabled'});
 await button.click();await expect(body).toBeHidden();
 await page.screenshot({path:dir+'/detail-closed.png',animations:'disabled'});
 await button.click();await page.emulateMedia({reducedMotion:'reduce'});await expect(body).toBeVisible();expect(await body.evaluate(e=>e.style.height)).toBe('');
});
