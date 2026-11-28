import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {chooseOption} from './select-helper.js';

test('手机规划日程与待安排独立分区，设置保持可编辑',async({page})=>{
 const state=initialState(),today=dayKey();
 // The current-time lower bound must not make this UI fixture depend on the wall clock.
 await page.clock.setFixedTime(new Date(today+'T09:00:00'));
 state.tasks=[{...newTask('待安排测试','inbox',''),duration:30}];
 await page.addInitScript(data=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(data))},state);
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'规划工作区'});
 await expect(nav.getByRole('button',{name:/日程时间轴/})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.planner .timeline')).toBeVisible();
 await expect(page.locator('.planner .unscheduled')).toBeHidden();
 await expect(page.getByLabel('工作开始时间',{exact:true})).toBeHidden();
 await page.getByRole('button',{name:/^规划设置/}).click();
 await page.getByLabel('工作开始时间',{exact:true}).fill('09:30');
 await expect(page.getByLabel('工作开始时间',{exact:true})).toHaveValue('09:30');
 await page.getByRole('button',{name:/^收起规划设置/}).click();
 await nav.getByRole('button',{name:/待安排任务/}).click();
 await expect(page.locator('.planner .timeline')).toBeHidden();
 await expect(page.locator('.planner .unscheduled')).toContainText('待安排测试');
 await page.screenshot({path:'test-results/planner-mobile-backlog.png',animations:'disabled'});
 await page.getByRole('button',{name:'寻找空闲时间',exact:true}).click();
 await expect(page.locator('.planner .unscheduled')).not.toContainText('待安排测试');
 await nav.getByRole('button',{name:/日程时间轴/}).click();
 await expect(page.locator('.planner .timeline')).toContainText('待安排测试');
 await page.screenshot({path:'test-results/planner-mobile-timeline.png',animations:'disabled'});
 await page.reload();await page.getByRole('button',{name:'每日规划',exact:true}).click();
 await page.getByRole('button',{name:/^规划设置/}).click();
 await expect(page.getByLabel('工作开始时间',{exact:true})).toHaveValue('09:30');
});

test('看板连续跨列从当前视觉位置重定向',async({page})=>{
 const data=initialState();data.tasks=[newTask('连续移动','inbox',dayKey())];
 await page.addInitScript(data=>{
  localStorage.setItem('todo-workbench-v1',JSON.stringify(data));
  const animate=Element.prototype.animate;window.__boardAnimations=[];
  Element.prototype.animate=function(...args){
   const a=animate.apply(this,args);
   if(this.matches('[data-board-task]')&&args[0]?.[0]?.translate){a.pause();a.currentTime=0;window.__boardAnimations.push(a)}
   return a;
  };
 },data);
 await page.goto('/');await page.getByRole('button',{name:'看板',exact:true}).click();
 const combo=()=>page.getByRole('combobox',{name:'状态 连续移动',exact:true});
 await chooseOption(combo(),'doing');
 await expect(page.locator('[data-lane-key=doing]')).toContainText('连续移动');
 await expect.poll(()=>page.evaluate(()=>window.__boardAnimations.length)).toBe(1);
 const card=page.locator('[data-board-task]').filter({hasText:'连续移动'});
 await page.evaluate(()=>{window.__boardAnimations[0].currentTime=80});
 const before=await card.boundingBox();
 await combo().focus();await page.keyboard.press('Enter');
 await page.getByRole('option',{name:'待处理',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__boardAnimations.length)).toBe(2);
 const after=await card.boundingBox();
 expect(Math.abs(before.x-after.x)).toBeLessThan(3);
 expect(Math.abs(before.y-after.y)).toBeLessThan(3);
 await page.evaluate(()=>window.__boardAnimations.at(-1).finish());
 await expect(page.locator('[data-lane-key=todo]')).toContainText('连续移动');
});
test('桌面窄工作区规划自动单列，宽工作区保持并排',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/');
 await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const grid=page.locator('.planner-grid');
 await expect(grid).toBeVisible();
 expect((await grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns)).split(' ').length).toBe(2);
 await page.setViewportSize({width:1000,height:900});
 await expect.poll(()=>grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
 await expect(page.locator('.planner .timeline')).toBeVisible();
 await expect(page.locator('.planner .unscheduled')).toBeVisible();
 await page.screenshot({path:'test-results/planner-desktop-narrow.png',animations:'disabled'});
});
