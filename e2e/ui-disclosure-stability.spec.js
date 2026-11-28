import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='test-results/disclosure-stability';
async function seed(page,width=1440,count=8){
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
 const d=initialState(),today=dayKey();d.lists[0].sections=[{id:'g1',name:'学习分组'},{id:'g2',name:'工作分组'}];d.tasks=Array.from({length:count},(_,i)=>({...newTask('任务 '+i,'inbox',today),sectionId:i<count/2?'g1':'g2'}));
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),d);await page.goto('/');mkdirSync(dir,{recursive:true});
}
async function trace(trigger,bodySelector,headerSelector){
 return trigger.evaluate((t,{bodySelector,headerSelector})=>new Promise((resolve,reject)=>{
  const body=document.querySelector(bodySelector),header=document.querySelector(headerSelector);
  const rect=()=>{const r=header.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};
  const start=body.getBoundingClientRect().height,baseline=rect(),frames=[],t0=performance.now();
  let turned=false,stable=0;t.click();
  function tick(now){
   const h=body.getBoundingClientRect().height,r=rect();
   frames.push({ms:now-t0,height:h,...r});
   if(!turned&&h>1&&h<start-3){t.click();turned=true}
   if(turned&&Math.abs(h-start)<.15&&!body.style.height&&!body.dataset.motionBusy){if(++stable>=3){resolve({start,baseline,frames});return}}else stable=0;
   if(now-t0>2500){reject(Error('disclosure did not settle'));return}
   requestAnimationFrame(tick)
  }requestAnimationFrame(tick)
 }),{bodySelector,headerSelector});
}
function stableHeader(data){
 expect(data.frames.some(f=>f.height<data.start-3)).toBe(true);
 for(const axis of ['x','y','w','h'])expect(Math.max(...data.frames.map(f=>Math.abs(f[axis]-data.baseline[axis]))),axis).toBeLessThanOrEqual(1);
}
for(const width of [1440,390])test('详情标题稳定 '+width,async({page})=>{
 await seed(page,width);await page.locator('.task-body').first().click();
 const card=page.locator('[data-detail-section=checklist]'),button=card.locator('.detail-section-toggle');
 await card.getByRole('textbox',{name:'新检查项'}).fill('未提交草稿');
 await button.scrollIntoViewIfNeeded();
 const data=await trace(button,'[data-detail-section=checklist] .detail-section-body','[data-detail-section=checklist] .detail-section-heading h3');
 writeFileSync(dir+'/detail-'+width+'.json',JSON.stringify(data,null,2));stableHeader(data);
 await expect(card.getByRole('textbox',{name:'新检查项'})).toHaveValue('未提交草稿');
});
test('任务分组中途反向、标题不跳、折叠后释放行',async({page})=>{
 await seed(page);await page.locator('[data-view-key=inbox]').click();
 const trigger=page.getByRole('button',{name:'折叠分组 学习分组'}),id=await trigger.getAttribute('aria-controls'),group=page.locator('[id="'+id+'"]');
 await page.locator('.task-content').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
 const data=await trace(trigger,'[id="'+id+'"]','.task-group:has([id="'+id+'"]) .group-collapse>span');
 writeFileSync(dir+'/group-reversal.json',JSON.stringify(data,null,2));stableHeader(data);
 await expect(group.locator('.task-row')).toHaveCount(4);
 await trigger.click();await expect(group.locator('.shared-disclosure-clip')).toHaveJSProperty('inert',true);
 await expect(group.locator('.task-row')).toHaveCount(0);
 await page.screenshot({path:dir+'/group-closed.png',animations:'disabled'});
 const opening=await page.getByRole('button',{name:'展开分组 学习分组'}).evaluate(t=>new Promise((resolve,reject)=>{
  const body=document.getElementById(t.getAttribute('aria-controls')),start=performance.now(),frames=[];
  t.click();
  function tick(now){
   const h=body.getBoundingClientRect().height,full=body.firstElementChild.scrollHeight;
   frames.push({ms:now-start,height:h,full,flip:!!document.querySelector('.task-group .task-row')&&[...document.querySelectorAll('.task-group .task-row')].some(row=>row.getAnimations().some(a=>a.effect?.getKeyframes().some(k=>k.translate!==undefined)))});
   if(full>0&&h>=full-0.5&&!body.dataset.motionBusy){resolve(frames);return}
   if(now-start>1500){reject(Error('opening did not settle'));return}requestAnimationFrame(tick)
  }requestAnimationFrame(tick)
 }));
 expect(opening.some(f=>f.height>1&&f.height<f.full-1)).toBe(true);
 expect(opening.every(f=>!f.flip)).toBe(true);
 writeFileSync(dir+'/group-opening.json',JSON.stringify(opening,null,2));
 await expect(group.locator('.task-row')).toHaveCount(4);
 await expect.poll(()=>group.evaluate(e=>e.getAnimations().length)).toBe(0);
 await page.screenshot({path:dir+'/group-open.png',animations:'disabled'});
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'折叠分组 学习分组'}).click();await expect(group.locator('.task-row')).toHaveCount(0);
});
test('今日执行顶部标题和描述尺寸不随开合变化',async({page})=>{
 await seed(page,390);const panel=page.getByRole('region',{name:'今日执行'}),button=panel.locator('.today-execution-toggle');
 await expect(button).toBeVisible();await page.locator('.task-content').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
 const frames=await button.evaluate(t=>new Promise(resolve=>{
  const head=t.closest('.today-execution-head'),title=head.querySelector('strong'),meta=head.querySelector('.today-execution-meta'),fold=document.getElementById(t.getAttribute('aria-controls'));
  const measure=()=>[title,meta,t].map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]});
  const base=measure(),frames=[],start=performance.now();t.click();let reversed=false;
  function tick(now){frames.push({ms:now-start,rects:measure(),height:fold.getBoundingClientRect().height});if(!reversed&&now-start>100){t.click();reversed=true}if(now-start>600){resolve({base,frames});return}requestAnimationFrame(tick)}requestAnimationFrame(tick)
 }));
 writeFileSync(dir+'/today-header.json',JSON.stringify(frames,null,2));
 expect(frames.frames.some(f=>f.height>2)).toBe(true);
 for(const f of frames.frames)for(let i=0;i<3;i++)for(let j=0;j<4;j++)expect(Math.abs(f.rects[i][j]-frames.base[i][j])).toBeLessThanOrEqual(1);
});
test('大列表折叠不保留任务 DOM',async({page})=>{
 await seed(page,1440,320);await page.locator('[data-view-key=inbox]').click();
 const t=page.getByRole('button',{name:'折叠分组 学习分组'}),id=await t.getAttribute('aria-controls'),group=page.locator('[id="'+id+'"]');
 await expect(group).toHaveAttribute('data-animate','false');await t.click();await expect(group.locator('.virtual-task-list')).toHaveCount(0);
});
