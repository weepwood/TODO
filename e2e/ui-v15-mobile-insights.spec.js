import {test,expect,devices} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
async function seed(page,theme='light'){
 const today=dayKey(),yesterday=shiftDay(today,-1),d=initialState(),a={...newTask('回顾样本','work',today),status:'completed',stage:'done',completedAt:today+'T12:00:00'};
 d.theme=theme;d.tasks=[a,newTask('移动手势任务','work',today),newTask('第二任务','work',today)];d.sessions=[{id:'s',taskId:a.id,mode:'focus',seconds:3600,startedAt:today+'T09:00:00'}];d.habits=[{id:'h',name:'阅读',days:Array.from({length:8},(_,i)=>shiftDay(today,-i*2)),weeklyGoal:5}];
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);await page.goto('/');return {today,yesterday};
}
async function drag(cdp,box,dx,dy){const x=box.x+box.width/2,y=box.y+box.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=4;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/4,y:y+dy*i/4}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
test('移动长按多选、左滑无破坏操作、详情底部操作和草稿面板下滑',async({browser})=>{
 const ctx=await browser.newContext({...devices['Pixel 7'],baseURL:'http://127.0.0.1:4178'});
 try{const page=await ctx.newPage();await seed(page,'dark');const row=page.locator('.task-body').filter({hasText:'移动手势任务'});await expect(row).toBeVisible();const cdp=await ctx.newCDPSession(page);
 let b=await row.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(650);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.getByText('已选 1 项',{exact:true})).toBeVisible();await expect(page.locator('.details')).toHaveCount(0);await expect(page.getByRole('menu')).toHaveCount(0);
 await page.getByRole('button',{name:'结束选择'}).click();b=await row.boundingBox();await drag(cdp,b,-85,0);await expect(page.getByRole('menuitem',{name:'安排明天'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.details')).toHaveCount(0);
 await page.waitForTimeout(750);await row.tap();const detail=page.getByRole('complementary',{name:'任务详情'}),actions=detail.getByRole('navigation',{name:'详情快捷操作'});await expect(actions.getByRole('button',{name:'安排'})).toBeInViewport();await actions.getByRole('button',{name:'安排'}).click();await expect(detail.getByRole('button',{name:'计划时间选择器'})).toBeVisible();await page.screenshot({path:'test-results/v15-mobile-detail.png',animations:'disabled'});await actions.getByRole('button',{name:'返回列表'}).click();await expect(detail).toHaveCount(0);
 await page.getByRole('button',{name:'新建任务',exact:true}).click();const capture=page.getByRole('dialog',{name:'快速新建任务'});await capture.getByRole('textbox',{name:'快速任务名称'}).fill('保留草稿');await capture.getByRole('textbox',{name:'快速任务名称'}).blur();await expect.poll(()=>capture.evaluate(el=>el.getAnimations().every(a=>a.playState!=='running'))).toBe(true);b=await capture.locator('.sheet-grabber').boundingBox();await drag(cdp,b,0,100);await expect(capture).toHaveCount(0);await page.getByRole('button',{name:'新建任务',exact:true}).click();await expect(capture.getByRole('textbox',{name:'快速任务名称'})).toHaveValue('保留草稿');await page.screenshot({path:'test-results/v15-mobile-sheet.png',animations:'disabled'});
 }finally{await ctx.close()}
});
for(const [width,height,theme] of [[1440,900,'light'],[390,844,'dark']])test('回顾目标、分析快照与阅读排版 '+width,async({page})=>{
 await page.setViewportSize({width,height});await seed(page,theme);
 await page.getByRole('button',{name:'统计',exact:true}).click();await expect(page.locator('.efficiency-overview')).toContainText('33.3%');await page.getByRole('button',{name:'回顾报告',exact:true}).click();const report=page.getByRole('region',{name:'任务回顾'});
 await report.getByRole('button',{name:'每月',exact:true}).click();const insights=report.locator('.review-insights');await expect(insights).toContainText('完成效率与计划偏差');await expect(insights).toContainText('+30 分钟');await expect(insights).toContainText('不能证明');
 await insights.getByRole('button',{name:'设置月度目标与年度目标'}).click();await insights.getByLabel('月度完成目标',{exact:true}).fill('10');await insights.getByLabel('月度完成目标',{exact:true}).press('Enter');await insights.getByLabel('月度专注目标',{exact:true}).fill('600');await insights.getByLabel('月度专注目标',{exact:true}).press('Enter');await insights.getByLabel('年度完成目标',{exact:true}).fill('120');await insights.getByLabel('年度完成目标',{exact:true}).press('Enter');await insights.getByRole('button',{name:'保存目标'}).click();
 await expect(insights.getByRole('progressbar',{name:'完成任务目标进度',exact:true})).toHaveAttribute('max','10');await expect(insights.getByRole('progressbar',{name:'年度完成任务目标进度',exact:true})).toHaveAttribute('max','120');
 await insights.getByText('目标版本历史 · 1 份',{exact:true}).click();await expect(insights.locator('.goal-history-row')).toContainText('月度 10 项 / 600 分钟');
 await report.getByRole('button',{name:'每日',exact:true}).click();await report.getByRole('button',{name:'上一周期'}).click();await expect(insights.getByRole('progressbar')).toHaveCount(0);await expect(insights.locator('.goal-version-summary')).toContainText('当前报告日期没有已知目标版本');
 await report.getByRole('button',{name:'今天',exact:true}).click();await report.getByRole('button',{name:'每月',exact:true}).click();await expect(insights.getByRole('progressbar',{name:'完成任务目标进度',exact:true})).toHaveAttribute('max','10');
 await insights.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/v15-insights-'+width+'.png',animations:'disabled'});
 await report.getByRole('button',{name:'保存快照'}).click();await expect(report).toContainText('已保存本机快照');await expect(report.locator('.review-insights')).toContainText('仅保存实际进展');
 await report.getByRole('button',{name:'阅读模式',exact:true}).first().click();await expect(report.locator('.report-reading')).toContainText('完成效率与计划偏差');
 await page.emulateMedia({media:'print'});await expect(page.locator('.todo-print-report').getByRole('heading',{name:'完成效率与计划偏差',exact:true})).toHaveCount(1);await expect(page.locator('.todo-print-report').getByRole('heading',{name:'周期趋势',exact:true})).toBeVisible();await page.emulateMedia({media:'screen'});await page.screenshot({path:'test-results/v15-report-'+width+'.png',animations:'disabled'});
});

for(const width of [390,1440])test('独立目标管理入口、历史保存及回顾互通 '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await seed(page,width===390?'dark':'light');
 await page.getByRole('button',{name:'统计',exact:true}).click();
 await page.getByRole('button',{name:'目标管理',exact:true}).click();
 const panel=page.getByRole('region',{name:'目标管理'});await expect(panel).toBeVisible();
 await panel.getByRole('button',{name:'设置月度目标与年度目标'}).click();
 await panel.getByLabel('月度完成目标',{exact:true}).fill('42');await panel.getByLabel('月度完成目标',{exact:true}).press('Enter');
 await panel.getByRole('button',{name:'保存目标'}).click();
 await expect(panel.getByRole('progressbar',{name:'完成任务目标进度',exact:true})).toHaveAttribute('max','42');
 await expect.poll(()=>panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await panel.getByRole('button',{name:'查看对应日期回顾'}).click();
 const report=page.getByRole('region',{name:'任务回顾'});await expect(report.getByRole('progressbar',{name:'完成任务目标进度',exact:true})).toHaveAttribute('max','42');
 await report.getByRole('button',{name:'返回',exact:true}).click();
 if(width===390){await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name:'目标管理',exact:true}).click()}
 else await page.getByRole('button',{name:'打开目标管理',exact:true}).click();
 await expect(panel.getByRole('progressbar',{name:'完成任务目标进度',exact:true})).toHaveAttribute('max','42');
 await page.screenshot({path:'test-results/goal-workspace-'+width+'.png',animations:'disabled'});
});

test('时长参考样本门槛、预测及清单范围',async({page})=>{
 const today=dayKey(),d=initialState();
 d.tasks=[];d.sessions=[];
 for(let i=0;i<12;i++){const date=shiftDay(today,i-12),t={...newTask('时长样本'+i,'work',date),duration:30,status:'completed',stage:'done',completedAt:date+'T12:00:00'};d.tasks.push(t);d.sessions.push({id:'forecast-'+i,taskId:t.id,mode:'focus',seconds:3600,startedAt:date+'T09:00:00'})}
 await page.addInitScript(d=>localStorage.setItem('todo-workbench-v1',JSON.stringify(d)),d);await page.goto('/');
 await page.getByRole('button',{name:'统计',exact:true}).click();
 const forecast=page.locator('.duration-forecast');await expect(forecast).toContainText('12 项');await expect(forecast).toContainText('60–60 分钟');await expect(forecast).toContainText('回测 2 项');
 await forecast.getByLabel('参考任务预计分钟',{exact:true}).fill('20');await forecast.getByLabel('参考任务预计分钟',{exact:true}).press('Enter');await expect(forecast).toContainText('40–40 分钟');
 await page.getByRole('combobox',{name:'统计清单'}).click();await page.getByRole('option',{name:'收集箱',exact:true}).click();await expect(forecast.getByRole('status')).toContainText('有效样本不足10项');
});

test('目标编辑离开保护、取消及报告模式切换',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 await page.getByRole('button',{name:'打开目标管理',exact:true}).click();
 const panel=page.getByRole('region',{name:'目标管理'});
 await panel.getByRole('button',{name:'设置月度目标与年度目标'}).click();
 await panel.getByLabel('月度完成目标',{exact:true}).fill('73');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'统计',exact:true}).click();
 await expect(panel.getByLabel('月度完成目标',{exact:true})).toHaveValue('73');
 await panel.getByRole('button',{name:'保存目标'}).click();
 await panel.getByRole('button',{name:'查看对应日期回顾'}).click();
 const report=page.getByRole('region',{name:'任务回顾'});
 await expect(report.getByRole('progressbar',{name:'完成任务目标进度',exact:true})).toHaveAttribute('max','73');
 await report.getByRole('button',{name:'设置月度目标与年度目标'}).click();
 await report.getByLabel('月度完成目标',{exact:true}).fill('99');
 page.once('dialog',d=>d.dismiss());await report.getByRole('button',{name:'阅读模式',exact:true}).click();
 await expect(report.getByLabel('月度完成目标',{exact:true})).toHaveValue('99');
 await report.getByRole('button',{name:'取消',exact:true}).click();
 await report.getByRole('button',{name:'阅读模式',exact:true}).click();await expect(report.locator('.report-reading')).toBeVisible();
});
