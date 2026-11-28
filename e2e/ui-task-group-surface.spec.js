import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
const dir='test-results/task-group-surface';
for(const [width,design,theme] of [[1440,'classic','light'],[1440,'native','light'],[1440,'classic','dark'],[390,'native','dark'],[320,'classic','light']]){
 test('分组模块底纹、文字对比与开合 '+width+' '+design+' '+theme,async({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  const d=initialState(),today=dayKey();d.theme=theme;d.lists[0].sections=[{id:'g1',name:'收集与学习',color:'#5276d6'},{id:'g2',name:'工作',color:'#ed7458'}];
  d.tasks=Array.from({length:7},(_,i)=>({...newTask('任务 '+(i+1),'inbox',today),sectionId:i<6?'g1':'g2'}));
  await page.addInitScript(({d,design})=>{localStorage.setItem('todo-workbench-v1',JSON.stringify(d));localStorage.setItem('todo-appearance-v1',JSON.stringify({designTheme:design,accent:'blue'}))},{d,design});
  await page.goto('/');
  if(width<=860){await page.getByRole('button',{name:'打开导航',exact:true}).click();}
  await page.locator('[data-view-key=inbox]').click();
  await page.mouse.move(0,0);
  await expect(page.locator('html')).toHaveAttribute('data-design-theme',design);
  const groups=page.locator('.task-group.module-card');await expect(groups).toHaveCount(3);await expect(groups.last().getByRole('button',{name:'折叠分组 未分组'})).toBeVisible();
  const result=await groups.evaluateAll(els=>{
   const probe=document.createElement('div');document.body.append(probe);
   const color=token=>{probe.style.backgroundColor='var('+token+')';return getComputedStyle(probe).backgroundColor};
   const bg=color('--bg'),surface=color('--module-card-bg'),text=color('--text'),muted=color('--muted');
   const ctx=document.createElement('canvas').getContext('2d');const lum=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0)};
   const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
   probe.remove();return {bg,surface,textContrast:contrast(text,surface),mutedContrast:contrast(muted,surface),cards:els.map(e=>({bg:getComputedStyle(e).backgroundColor,radius:getComputedStyle(e).borderRadius,shadow:getComputedStyle(e).boxShadow,overflow:getComputedStyle(e).overflow,rows:[...e.querySelectorAll('.task-row')].map(r=>getComputedStyle(r).backgroundColor)}))};
  });
  console.log(JSON.stringify({width,design,theme,...result}));
  expect(result.surface).not.toBe(result.bg);expect(result.textContrast).toBeGreaterThanOrEqual(4.5);expect(result.mutedContrast).toBeGreaterThanOrEqual(4.5);
  for(const card of result.cards){expect(card.bg).toBe(result.surface);expect(card.radius).toBe('12px');expect(card.shadow).toBe('none');expect(card.overflow).toBe('visible');expect(card.rows.every(c=>c==='rgba(0, 0, 0, 0)')).toBe(true);}
  const first=groups.first(),head=first.locator('.list-caption'),full=await first.boundingBox(),before=await head.boundingBox();
  mkdirSync(dir,{recursive:true});const prefix=dir+'/'+width+'-'+design+'-'+theme;
  await page.screenshot({path:prefix+'-open.png',animations:'disabled'});
  await first.getByRole('button',{name:'折叠分组 收集与学习'}).click();
  await expect(first.locator('.task-row')).toHaveCount(0);
  const closed=await first.boundingBox(),after=await head.boundingBox();
  expect(closed.height).toBeLessThan(full.height/2);expect(Math.abs(before.y-after.y)).toBeLessThanOrEqual(1);expect(Math.abs(before.height-after.height)).toBeLessThanOrEqual(1);
  await page.screenshot({path:prefix+'-closed.png',animations:'disabled'});
  await first.getByRole('button',{name:'展开分组 收集与学习'}).click();await expect(first.locator('.task-row')).toHaveCount(6);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}
