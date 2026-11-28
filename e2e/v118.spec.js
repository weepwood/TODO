import {test,expect,devices} from '@playwright/test';
import {initialState,newTask} from '../src/domain.js';
async function seed(page){
 const state=initialState();state.tasks=[{...newTask('午夜任务','inbox','2026-12-31'),time:'23:30',duration:60}];
 await page.addInitScript(data=>localStorage.setItem('todo-workbench-v1',JSON.stringify(data)),state);
 await page.goto('/');await page.getByRole('button',{name:'每日规划',exact:true}).click();await page.getByLabel('规划日期').fill('2026-12-31');
 await page.getByRole('button',{name:'显示全天',exact:true}).click();
}
test('跨日时间块保留时长与日期，键盘移动及次日延续',async({page})=>{
 await seed(page);const block=page.locator('button.time-block').filter({hasText:'午夜任务'});
 await expect(block).toHaveAttribute('aria-label',/23:30–24:00 · 延续至次日/);
 await page.getByRole('button',{name:'后一天',exact:true}).click();await expect(block).toHaveAttribute('aria-label',/00:00–00:30 · 跨日延续/);
 await expect(page.getByRole('button',{name:'移动时间 午夜任务'})).toHaveCount(0);
 await page.getByRole('button',{name:'前一天',exact:true}).click();const handle=page.getByRole('button',{name:'移动时间 午夜任务'});
 await handle.focus();await page.keyboard.press('ArrowDown');await expect(block).toHaveAttribute('aria-label',/23:45–24:00/);
 await page.keyboard.press('ArrowDown');await expect(page.getByLabel('规划日期')).toHaveValue('2027-01-01');
 await expect(block).toHaveAttribute('aria-label',/00:00–01:00/);
 await handle.focus();await page.keyboard.press('ArrowLeft');await expect(page.getByLabel('规划日期')).toHaveValue('2026-12-31');
 await expect(block).toHaveAttribute('aria-label',/00:00–01:00/);
});
test('全天时间轴真实触摸事件跨午夜移动',async({browser})=>{
 const ctx=await browser.newContext({...devices['Pixel 7'],baseURL:'http://127.0.0.1:4178'});
 try{const page=await ctx.newPage();await seed(page);
 const handle=page.getByRole('button',{name:'移动时间 午夜任务'});await handle.scrollIntoViewIfNeeded();const b=await handle.boundingBox();if(!b)throw Error('no handle');
 const x=b.x+b.width/2,y=b.y+b.height/2;const cdp=await ctx.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*7}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(page.getByLabel('规划日期')).toHaveValue('2027-01-01');
 await expect(page.locator('button.time-block').filter({hasText:'午夜任务'})).toHaveAttribute('aria-label',/00:15–01:15/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await ctx.close()}
});
test('弹窗出场动画不阻挡后续操作，减少动效下立即关闭',async({page})=>{
 await page.goto('/');await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'新建任务',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'no-preference'});for(let i=0;i<3;i++){await page.getByRole('button',{name:'新建任务',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0)}
});
test('日历日视图待安排任务触摸拖放',async({browser})=>{
 const ctx=await browser.newContext({viewport:{width:1440,height:900},hasTouch:true,baseURL:'http://127.0.0.1:4178'});
 try{const p=await ctx.newPage();await p.goto('/');
 await p.getByRole('button',{name:'新建任务',exact:true}).click();await p.getByRole('textbox',{name:'快速任务名称'}).fill('日视图触摸安排');await p.getByRole('button',{name:'创建任务',exact:true}).click();
 await p.getByRole('button',{name:'日历',exact:true}).click();await p.getByLabel('联动日期').fill('2026-12-10');
 await p.locator('.calendar-main').getByText('日',{exact:true}).click();await p.getByRole('button',{name:'待安排',exact:true}).click();
 const handle=p.getByRole('button',{name:'拖入日历 日视图触摸安排'}),slot=p.locator('.calendar-main [data-time="06:00:00"]').last();
 await expect(handle).toBeVisible();await slot.scrollIntoViewIfNeeded();const a=await handle.boundingBox(),b=await slot.boundingBox();if(!a||!b)throw Error('missing target');
 const x=a.x+a.width/2,y=a.y+a.height/2,tx=b.x+b.width/2,ty=b.y+5;
 const hit=await p.evaluate(({tx,ty})=>document.elementFromPoint(tx,ty)?.closest('.calendar-main')!==null&&!!document.elementFromPoint(tx,ty),{tx,ty});expect(hit).toBe(true);
 const cdp=await ctx.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await p.waitForTimeout(400);
 for(let i=1;i<=20;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(tx-x)*i/20,y:y+(ty-y)*i/20}]});await p.waitForTimeout(15)}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(handle).toHaveCount(0);await p.getByRole('button',{name:'选定日期',exact:true}).click();await expect(p.locator('.agenda-title').filter({hasText:'日视图触摸安排'})).toContainText('06:00');
 }finally{await ctx.close()}
});
test('日历周视图待安排任务触摸拖放',async({browser})=>{
 const ctx=await browser.newContext({viewport:{width:1440,height:900},hasTouch:true,baseURL:'http://127.0.0.1:4178'});
 try{const p=await ctx.newPage();await p.goto('/');
 await p.getByRole('button',{name:'新建任务',exact:true}).click();await p.getByRole('textbox',{name:'快速任务名称'}).fill('周视图触摸安排');await p.getByRole('button',{name:'创建任务',exact:true}).click();
 await p.getByRole('button',{name:'日历',exact:true}).click();await p.getByLabel('联动日期').fill('2026-12-10');
 await p.locator('.calendar-main').getByText('周',{exact:true}).click();await p.getByRole('button',{name:'待安排',exact:true}).click();
 const handle=p.getByRole('button',{name:'拖入日历 周视图触摸安排'}),slot=p.locator('.calendar-main [data-time="06:00:00"]').last();
 await expect(handle).toBeVisible();await slot.scrollIntoViewIfNeeded();const a=await handle.boundingBox(),b=await slot.boundingBox();if(!a||!b)throw Error('missing target');
 const x=a.x+a.width/2,y=a.y+a.height/2,tx=await p.locator('.calendar-main [data-date="2026-12-10"]').first().evaluate(el=>{const r=el.getBoundingClientRect();return r.x+r.width/2}),ty=b.y+5;
 const hit=await p.evaluate(({tx,ty})=>document.elementFromPoint(tx,ty)?.closest('.calendar-main')!==null&&!!document.elementFromPoint(tx,ty),{tx,ty});expect(hit).toBe(true);
 const cdp=await ctx.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await p.waitForTimeout(400);
 for(let i=1;i<=20;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(tx-x)*i/20,y:y+(ty-y)*i/20}]});await p.waitForTimeout(15)}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(handle).toHaveCount(0);await p.getByRole('button',{name:'选定日期',exact:true}).click();await expect(p.locator('.agenda-title').filter({hasText:'周视图触摸安排'})).toContainText('06:00');
 }finally{await ctx.close()}
});
test('八个核心模块双主题布局及实际截图',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 for(const name of ['项目验收 今天 09:00 !3','整理资料 今天 11:00','阅读计划 今天 15:00']){await page.getByRole('textbox',{name:'新任务名称'}).fill(name);await page.getByRole('button',{name:'添加',exact:true}).click()}
 for(const [theme,label] of [['light','浅色'],['dark','深色']]){
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'外观与布局',exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  for(const [module,key] of [['任务','tasks'],['日历','calendar'],['看板','board'],['四象限','matrix'],['每日规划','planner'],['专注','focus'],['习惯','habits'],['统计','stats']]){
   await page.locator('.rail').getByRole('button',{name:module,exact:true}).click();
   await expect(page.locator('.rail button.active')).toHaveAttribute('aria-label',module);
   const ready={tasks:'.task-row',calendar:'.calendar-main [data-date]',board:'.board-column',matrix:'.board-column',planner:'.time-block-body',focus:'.focus-card',habits:'input[placeholder="添加每日习惯"]',stats:'.stat-grid'}[key];
   await expect(page.locator(ready).first()).toBeVisible();
   await expect(page.getByText(/加载日历…|加载工作视图…/)).toHaveCount(0);
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:'test-results/v118-'+theme+'-'+key+'.png',animations:'disabled'});
  }
 }
 expect(errors).toEqual([]);
});
