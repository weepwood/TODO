import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
async function seed(page,theme='light'){
 const today=dayKey(),yesterday=shiftDay(today,-1),d=initialState(),a={...newTask('历史完成示例','work',yesterday),status:'completed',stage:'done',completedAt:yesterday+'T12:00:00'};
 d.theme=theme;d.tasks=[a,newTask('今天执行示例','work',today)];d.habits=[{id:'h',name:'每日阅读',days:[today],weeklyGoal:5}];d.sessions=[{id:'s',taskId:a.id,mode:'focus',seconds:3600,startedAt:yesterday+'T09:00:00'}];
 const workflow={auto:false,lastRun:'',rules:[{id:'r',name:'检查规则',list:'missing',condition:'today',action:'high',trigger:'manual',enabled:true}]};
 await page.addInitScript(({d,workflow})=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d));if(!localStorage.getItem('todo-workflow-rules-v1'))localStorage.setItem('todo-workflow-rules-v1',JSON.stringify(workflow))},{d,workflow});await page.goto('/');return {today,yesterday};
}
test('独立自动化编排、异常定位、复制禁用及保存往返',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await seed(page);
 await page.getByRole('button',{name:'自动化工作台',exact:true}).click();
 const surface=page.getByRole('region',{name:'任务工作流自动化'});await expect(surface).toBeVisible();
 await surface.getByRole('button',{name:/异常报告/}).click();await expect(surface).toContainText('目标清单已移除');
 await surface.getByRole('button',{name:'编辑规则',exact:true}).click();await expect(surface.getByRole('textbox',{name:'规则名称 1'})).toBeVisible();
 await surface.getByRole('button',{name:'复制',exact:true}).click();await expect(surface.getByRole('textbox',{name:'规则名称 2'})).toHaveValue('检查规则 副本');
 await expect(surface.getByRole('checkbox',{name:'规则 2'})).not.toBeChecked();
 await surface.getByRole('button',{name:'执行预览',exact:true}).click();await expect(surface.getByText('执行预览 · 0 项')).toBeVisible();
 await surface.getByRole('button',{name:'保存规则',exact:true}).click();await expect(surface).toContainText('规则已保存');
 await surface.getByRole('button',{name:'规则编排',exact:true}).click();await page.screenshot({path:'test-results/studio-workflow.png',animations:'disabled'});
 await surface.getByRole('button',{name:'返回',exact:true}).click();await page.getByRole('button',{name:'自动化工作台',exact:true}).click();await expect(page.getByRole('textbox',{name:'规则名称 2'})).toHaveValue('检查规则 副本');
});
test('热力图、日期钻取、同指标比较和独立阅读打印报告',async({page})=>{
 await page.setViewportSize({width:1440,height:900});const {yesterday}=await seed(page,'dark');
 await page.getByRole('button',{name:'统计',exact:true}).click();
 const cell=page.locator('.heatmap button[data-day="'+yesterday+'"]');await cell.click();await expect(cell).toHaveAttribute('aria-pressed','true');
 const detail=page.locator('.activity-drill');await expect(detail).toContainText('历史完成示例');await expect(detail).toContainText('60 分钟');
 await page.getByRole('group',{name:'趋势比较指标'}).getByRole('button',{name:'专注时间'}).click();await expect(page.getByRole('group',{name:'热力图指标'}).getByRole('button',{name:'专注时间'})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.comparison-day[aria-pressed=true]')).toHaveAttribute('aria-label',new RegExp(yesterday));await page.screenshot({path:'test-results/studio-statistics.png',animations:'disabled'});
 await detail.getByRole('button',{name:'查看当日回顾'}).click();const report=page.getByRole('region',{name:'任务回顾'});await expect(report).toBeVisible();await expect(report).toContainText(yesterday);
 await report.getByRole('button',{name:'阅读模式',exact:true}).click();await expect(report.locator('.report-reading')).toContainText('历史完成示例');
 await page.screenshot({path:'test-results/studio-report-reading.png',animations:'disabled'});
 await page.emulateMedia({media:'print'});await expect(page.locator('.todo-print-report')).toBeVisible();await expect(page.locator('.app')).toBeHidden();await expect(page.locator('.todo-print-report')).toContainText('历史完成示例');await page.emulateMedia({media:'screen'});
 await report.getByRole('button',{name:'返回',exact:true}).click();await expect(page.locator('.todo-print-report')).toHaveCount(0);
});
for(const [width,height,theme] of [[1440,900,'light'],[1440,900,'dark'],[390,844,'light'],[390,844,'dark']])test('八核心模块视觉矩阵 '+width+' '+theme,async({page})=>{
 await page.setViewportSize({width,height});await seed(page,theme);
 for(const [key,name] of [['tasks','任务'],['calendar','日历'],['board','看板'],['matrix','四象限'],['planner','每日规划'],['focus','专注'],['habits','习惯'],['stats','统计']]){
  if(width<861&&!['tasks','calendar','planner','stats'].includes(key)){await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name,exact:true}).click()}else await page.locator('.rail').getByRole('button',{name,exact:true}).click();
  const surface=page.locator('[data-workspace-module="'+key+'"]');await expect(surface).toBeVisible();await expect(surface.locator('.heading h1')).toBeVisible();
  const ready={tasks:'.quick-add',calendar:'.calendar-main [data-date]',board:'.board-column',matrix:'.board-column',planner:'.planner-grid',focus:'.focus-card',habits:'.habit-row',stats:'.stats .stat-grid'}[key];await expect(surface.locator(ready).first()).toBeVisible();
  await expect.poll(()=>surface.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
  await page.screenshot({path:'test-results/studio-'+width+'-'+theme+'-'+key+'.png',animations:'disabled'});
 }
});

test('独立工作台和回顾报告移动端可用',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page,'dark');
 await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.getByRole('button',{name:'打开自动化工作台',exact:true}).click();
 const surface=page.getByRole('region',{name:'任务工作流自动化'});await expect(surface).toBeVisible();
 await expect.poll(()=>surface.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);await page.screenshot({path:'test-results/studio-mobile-workflow.png',animations:'disabled'});
 await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.getByRole('button',{name:'打开回顾报告',exact:true}).click();
 const report=page.getByRole('region',{name:'任务回顾'});await expect(report).toBeVisible();await report.getByRole('button',{name:'阅读模式',exact:true}).click();await expect(report.locator('.report-reading')).toBeVisible();
 await expect.poll(()=>report.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);await page.screenshot({path:'test-results/studio-mobile-report.png',animations:'disabled'});
});
