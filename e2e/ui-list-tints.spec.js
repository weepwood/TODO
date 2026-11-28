import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
const dir='test-results/list-tints';
for(const [width,design,theme] of [[1440,'classic','light'],[1440,'native','light'],[1440,'classic','dark'],[390,'native','dark']]){
 test('收集箱导航与清单淡色分组 '+width+' '+design+' '+theme,async({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});
  const d=initialState(),today=dayKey();d.theme=theme;d.lists[1].color='#5276d6';d.lists[2].color='#47a58d';d.lists.push({id:'black',name:'深色清单',color:'#000000',folderId:null,sections:[]},{id:'white',name:'浅色清单',color:'#ffffff',folderId:null,sections:[]});
  d.tasks=d.lists.flatMap(l=>[newTask(l.name+'任务',l.id,today)]);
  await page.addInitScript(({d,design})=>{localStorage.setItem('todo-workbench-v1',JSON.stringify(d));localStorage.setItem('todo-appearance-v1',JSON.stringify({designTheme:design,accent:'blue'}))},{d,design});
  await page.goto('/');if(width<861)await page.getByRole('button',{name:'打开导航',exact:true}).click();
  const sidebar=page.locator('.sidebar'),mine=sidebar.getByRole('group',{name:'我的清单'}),inbox=mine.locator('[data-view-key=inbox]');
  await expect(inbox).toHaveCount(1);await expect(sidebar.locator('[data-view-key=inbox]')).toHaveCount(1);await expect(mine.locator('.sidebar-row').first().locator('button[data-view-key]')).toHaveAttribute('data-view-key','inbox');
  await expect(sidebar.locator('nav [data-view-key=inbox]')).toHaveCount(0);
  mkdirSync(dir,{recursive:true});const prefix=dir+'/'+width+'-'+design+'-'+theme;
  await page.screenshot({path:prefix+'-sidebar.png',animations:'disabled'});
  await inbox.click();await expect(page.locator('.task-group[data-list-tint]')).toHaveCount(0);
  if(width<861)await page.getByRole('button',{name:'打开导航',exact:true}).click();
  await sidebar.locator('[data-view-key=today]').click();
  const sort=page.getByRole('button',{name:'分组、排序与顺序'});await sort.click();const menu=page.getByRole('menuitem',{name:/^分组/});if(width<861)await menu.click();else await menu.hover();await page.getByRole('menuitemradio',{name:'清单',exact:true}).click();
  const groups=page.locator('.task-group[data-list-tint=true]');await expect(groups).toHaveCount(5);
  const result=await groups.evaluateAll(els=>{
   const probe=document.createElement('div');document.body.append(probe);
   const get=token=>{probe.style.backgroundColor='var('+token+')';return getComputedStyle(probe).backgroundColor};
   const neutral=get('--module-card-neutral-bg'),text=get('--text'),muted=get('--muted');probe.remove();
   const ctx=document.createElement('canvas').getContext('2d');const rgb=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)};
   const lum=c=>rgb(c).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
   const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
   return els.map(e=>{const s=getComputedStyle(e),bg=s.backgroundColor;return {name:e.querySelector('.group-collapse>span').textContent,color:s.getPropertyValue('--group-list-color').trim(),bg,neutral,text:contrast(text,bg),muted:contrast(muted,bg),identity:contrast(getComputedStyle(e.querySelector('.task-list-name')).color,bg),icon:contrast(getComputedStyle(e.querySelector('.list-icon-symbol')).color,bg),delta:Math.max(...rgb(bg).map((v,i)=>Math.abs(v-rgb(neutral)[i])))}});
  });
  console.log(JSON.stringify({width,design,theme,result}));expect(new Set(result.map(r=>r.bg)).size).toBe(5);
  for(const r of result){expect(r.text).toBeGreaterThanOrEqual(4.5);expect(r.muted).toBeGreaterThanOrEqual(4.5);expect(r.identity).toBeGreaterThanOrEqual(4.5);expect(r.icon).toBeGreaterThanOrEqual(3);expect(r.delta).toBeLessThanOrEqual(16);}
  await expect(groups.filter({has:page.getByRole('button',{name:'折叠分组 工作',exact:true})})).toHaveCSS('--group-list-color','#5276d6');
  await page.screenshot({path:prefix+'-groups.png',animations:'disabled'});
  await groups.first().locator('.group-collapse').click();await expect(groups.first().locator('.task-row')).toHaveCount(0);await expect(groups.first()).toHaveCSS('background-color',result[0].bg);
  await sort.click();const next=page.getByRole('menuitem',{name:/^分组/});if(width<861)await next.click();else await next.hover();await page.getByRole('menuitemradio',{name:'日期',exact:true}).click();await expect(page.locator('.task-group[data-list-tint]')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 });
}
