import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {mkdirSync} from 'node:fs';
const dir='test-results/sidebar-sort';
async function seed(page,width=1440){
 await page.setViewportSize({width,height:900});
 const d=initialState();d.tasks=[newTask('收集任务','inbox',dayKey()),newTask('工作任务','work',dayKey())];
 d.folders=[{id:'fixture-folder',name:'资料文件夹',color:'#6784da'}];
 d.lists.push({id:'reading',name:'阅读清单',folderId:'fixture-folder',color:'#6784da',sections:[]},{id:'notes',name:'笔记清单',folderId:'fixture-folder',color:'#47a58d',sections:[]});
 d.tags=[{id:'tag1',name:'学习',color:'#6784da'},{id:'tag2',name:'工作标签',color:'#47a58d'}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);await page.goto('/');
 if(width<861)await page.getByRole('button',{name:'打开导航',exact:true}).click();
 mkdirSync(dir,{recursive:true});
}
const order=locator=>locator.evaluate(el=>[...el.children].filter(e=>e.dataset.sidebarSortId).map(e=>e.dataset.sidebarSortId));
const head=(page,name)=>page.locator('.sidebar-section-toggle').filter({hasText:new RegExp('^'+name+'$')});
async function drag(page,from,to){
 await from.scrollIntoViewIfNeeded();await to.scrollIntoViewIfNeeded();
 const a=await from.boundingBox(),b=await to.boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.waitForTimeout(400);
 await expect(page.locator('[data-sidebar-dragging=true]')).toHaveCount(1);
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.waitForTimeout(150);await page.mouse.up();
 await expect(page.locator('[data-sidebar-dragging=true]')).toHaveCount(0);
}
test('栏目长按拖动排序、短按折叠、重新加载保留',async({page})=>{
 await seed(page);const sections=page.locator('.sidebar-sections');
 const before=await order(sections);
 await head(page,'我的清单').click();await expect(head(page,'我的清单')).toHaveAttribute('aria-expanded','false');
 await expect(page.getByRole('group',{name:'我的清单'})).toHaveCount(0);
 await head(page,'任务筛选').click();await expect(head(page,'任务筛选')).toHaveAttribute('aria-expanded','false');
 await page.waitForTimeout(400);
 await drag(page,head(page,'我的清单'),head(page,'任务筛选'));
 await expect.poll(()=>order(sections)).toEqual(['lists',...before.filter(k=>k!=='lists')]);
 await expect(head(page,'我的清单')).toHaveAttribute('aria-expanded','false');
 await page.reload();await expect.poll(()=>order(sections)).toEqual(['lists',...before.filter(k=>k!=='lists')]);
 await expect(head(page,'我的清单')).toHaveAttribute('aria-expanded','false');
 await head(page,'我的清单').click();await expect(page.getByRole('group',{name:'我的清单'})).toBeVisible();
 await page.screenshot({path:dir+'/sections-reordered.png',animations:'disabled'});
});
test('清单及文件夹同级长按排序，短按导航和键盘排序不改变归属',async({page})=>{
 await seed(page);const mine=page.getByRole('group',{name:'我的清单'}),item=id=>mine.locator('[data-view-key="'+id+'"]');
 await head(page,'任务筛选').click();await page.waitForTimeout(400);
 const before=await order(mine);
 await drag(page,item('work'),item('inbox'));
 await expect.poll(()=>order(mine)).toEqual(['list:work',...before.filter(k=>k!=='list:work')]);
 await page.waitForTimeout(250);await item('work').click();await expect(item('work')).toHaveAttribute('aria-current','page');
 await item('work').focus();await page.keyboard.press('Alt+ArrowDown');await expect.poll(()=>order(mine)).toEqual(['list:inbox','list:work',...before.filter(k=>!['list:inbox','list:work'].includes(k))]);
 const folder=mine.getByRole('button',{name:'资料文件夹',exact:true});await folder.click();await expect(folder).toHaveAttribute('aria-expanded','false');await folder.click();await expect(folder).toHaveAttribute('aria-expanded','true');
 await page.waitForTimeout(400);await drag(page,item('notes'),item('reading'));
 await expect.poll(()=>mine.locator('[data-sidebar-sort-id="folder:fixture-folder"] .nested .sidebar-sort-stack').evaluate(el=>[...el.children].map(x=>x.dataset.sidebarSortId))).toEqual(['list:notes','list:reading']);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
 expect(saved.lists.find(l=>l.id==='notes').folderId).toBe('fixture-folder');expect(saved.tasks.find(t=>t.title==='工作任务').listId).toBe('work');
 await page.reload();await expect.poll(()=>order(mine)).toEqual(['list:inbox','list:work',...before.filter(k=>!['list:inbox','list:work'].includes(k))]);
 await page.screenshot({path:dir+'/lists-reordered.png',animations:'disabled'});
});
test('快速移动不启动长按拖拽，新增菜单仍独立',async({page})=>{
 await seed(page);const sections=page.locator('.sidebar-sections'),before=await order(sections),h=head(page,'我的清单'),a=await h.boundingBox();
 await page.mouse.move(a.x+35,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+35,a.y-40,{steps:2});await page.mouse.up();
 await expect.poll(()=>order(sections)).toEqual(before);
 await h.hover();await page.getByRole('button',{name:'新建分类',exact:true}).click();await expect(page.getByRole('menuitem',{name:'新建清单',exact:true})).toBeVisible();await page.keyboard.press('Escape');
});
test('移动端栏目开合、触控新增入口与键盘排序',async({page})=>{
 await seed(page,390);const h=head(page,'我的清单');await h.click();await expect(h).toHaveAttribute('aria-expanded','false');await h.click();await expect(h).toHaveAttribute('aria-expanded','true');
 await expect(page.getByRole('button',{name:'新建分类',exact:true})).toBeVisible();
 await h.focus();await page.keyboard.press('Alt+ArrowUp');await expect.poll(()=>order(page.locator('.sidebar-sections'))).toEqual(['filters','lists','smart','tags','history','tools']);
 await page.screenshot({path:dir+'/mobile.png',animations:'disabled'});
});

test.describe('真实触摸传感器',()=>{
 test.use({hasTouch:true,isMobile:true});
 test('触屏短滑动不排序，长按后拖动清单',async({page,browserName})=>{
  test.skip(browserName!=='chromium','CDP touch input only available in Chromium');
  await seed(page,390);const mine=page.getByRole('group',{name:'我的清单'});
  await head(page,'任务筛选').tap();await page.waitForTimeout(400);
  const work=mine.locator('[data-view-key=work]'),inbox=mine.locator('[data-view-key=inbox]'),before=await order(mine);
  const cdp=await page.context().newCDPSession(page);
  const send=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y}]});
  await work.scrollIntoViewIfNeeded();const a=await work.boundingBox(),x=a.x+40,y=a.y+a.height/2;
  await send('touchStart',x,y);await send('touchMove',x,y-45);await send('touchEnd');await expect.poll(()=>order(mine)).toEqual(before);
  await page.waitForTimeout(650);
  await work.scrollIntoViewIfNeeded();await inbox.scrollIntoViewIfNeeded();const aa=await work.boundingBox(),b=await inbox.boundingBox(),sx=aa.x+40,sy=aa.y+aa.height/2,tx=b.x+40,ty=b.y+b.height/2;
  await send('touchStart',sx,sy);await page.waitForTimeout(450);
  console.log('touch coordinates', {sx,sy,tx,ty},await inbox.boundingBox(),await work.boundingBox());
  await expect(page.locator('[data-sidebar-dragging=true]')).toHaveCount(1);
  for(let i=1;i<=12;i++){await send('touchMove',sx+(tx-sx)*i/12,sy+(ty-sy)*i/12);await page.waitForTimeout(16)}
  await page.waitForTimeout(160);await send('touchEnd');await expect.poll(()=>order(mine)).toEqual(['list:work',...before.filter(k=>k!=='list:work')]);
  await page.screenshot({path:dir+'/touch-reordered.png',animations:'disabled'});
 });
});
