import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';

async function assertFits(dialog,page){
 await expect(dialog).toBeVisible();
 const result=await dialog.evaluate(el=>{
  const b=el.getBoundingClientRect(),view=document.documentElement.clientWidth;
  return {left:b.left,right:b.right,viewport:view,width:el.clientWidth,scroll:el.scrollWidth};
 });
 expect(result.left).toBeGreaterThanOrEqual(-1);
 expect(result.right).toBeLessThanOrEqual(result.viewport+1);
 expect(result.scroll).toBeLessThanOrEqual(result.width+2);
 await expect(dialog.getByRole('button',{name:'关闭',exact:true})).toBeInViewport();
}
async function view(page,key,mobile){
 if(mobile)await page.getByRole('button',{name:'打开导航',exact:true}).click();
 await page.locator('[data-view-key='+key+']').click();
}
for(const [width,height,theme] of [[1440,900,'light'],[1440,900,'dark'],[390,844,'light'],[390,844,'dark'],[320,640,'dark']]){
 test('工作流三模块视觉 '+width+' '+theme,async({page})=>{
  const d=initialState(),today=dayKey(),a={...newTask('一个用于验收窄屏布局的长期任务','work',today),status:'completed',stage:'done',completedAt:today+'T12:00:00',points:-3};
  d.theme=theme;d.tasks=[a,{...newTask('每日重复学习任务','inbox',today),repeat:'daily'},{...newTask('暂停冲突系列','work',today),repeat:'daily',repeatCount:9,miss:'keep',seriesHold:{count:10,miss:'skip'}},newTask('普通待办','personal',shiftDay(today,-1))];
  d.sessions=[{id:'focus-a',taskId:a.id,mode:'focus',startedAt:today+'T09:00:00',seconds:3600}];
  const workflow={auto:false,lastRun:'',rules:[{id:'rule-a',name:'积压任务自动安排到明天',list:'all',condition:'overdue',extra:'todo',match:'all',action:'tomorrow',trigger:'time',at:'21:00',enabled:true}]};
  await page.addInitScript(({d,workflow})=>{localStorage.setItem('todo-workbench-v1',JSON.stringify(d));localStorage.setItem('todo-workflow-rules-v1',JSON.stringify(workflow))},{d,workflow});
  await page.setViewportSize({width,height});await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  const mobile=width<=860,tag=width+'-'+theme;
  await view(page,'today',mobile);await page.getByRole('button',{name:'今日更多操作'}).click();await page.getByRole('menuitem',{name:'自动化',exact:true}).click();
  const rules=page.getByRole('dialog',{name:'任务工作流自动化'});
  await assertFits(rules,page);
  await page.screenshot({path:'test-results/quality-rules-'+tag+'.png',animations:'disabled'});
  const save=rules.getByRole('button',{name:'保存规则',exact:true});await expect(save).toBeInViewport();
  await rules.locator('.workflow-config-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
  await expect(save).toBeInViewport();await expect(rules.getByRole('button',{name:'执行规则',exact:true})).toBeInViewport();await expect(rules.getByRole('button',{name:'关闭',exact:true})).toBeInViewport();
  await rules.locator('.workflow-config-scroll').evaluate(el=>el.scrollTop=0);
  await rules.getByRole('button',{name:'运行时间 1选择器',exact:true}).click();await expect(page.getByRole('button',{name:'应用时间',exact:true})).toBeVisible();await page.getByRole('button',{name:'应用时间',exact:true}).click();
  await rules.getByRole('button',{name:'关闭',exact:true}).click();
  await view(page,'recurring',mobile);await page.getByRole('button',{name:'系列管理',exact:true}).click();
  const series=page.getByRole('dialog',{name:'重复系列管理中心'});
  await assertFits(series,page);
  await page.screenshot({path:'test-results/quality-series-'+tag+'.png',animations:'disabled'});
  await series.getByRole('button',{name:/待处理冲突/}).click();await expect(series.getByText('暂停冲突系列',{exact:true})).toBeVisible();
  await expect(series.getByText('每日重复学习任务',{exact:true})).toHaveCount(0);
  await expect(series.getByRole('button',{name:/待处理冲突/})).toHaveAttribute('aria-pressed','true');await series.getByRole('textbox',{name:'搜索重复系列'}).fill('不存在');await expect(series.getByText('暂无匹配系列')).toBeVisible();
  await series.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'统计',exact:true}).filter({visible:true}).click();
  await page.getByRole('button',{name:'任务回顾',exact:true}).click();
  const review=page.getByRole('dialog',{name:'任务回顾'});
  await review.getByRole('button',{name:'每月',exact:true}).click();
  await assertFits(review,page);await expect(review.getByRole('button',{name:'导出 Markdown'})).toBeInViewport();
  await review.getByRole('group',{name:'完成任务每日趋势'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/quality-review-'+tag+'.png',animations:'disabled'});
  await expect(review.getByRole('button',{name:'导出 Markdown'})).toBeInViewport();
  const columns=review.getByRole('group',{name:'完成任务每日趋势'});
  expect(await columns.evaluate(el=>el.scrollWidth>=el.clientWidth)).toBe(true);
  await review.getByRole('button',{name:'关闭',exact:true}).click();
 });
}
