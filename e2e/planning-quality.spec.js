import {test,expect} from '@playwright/test';
import {initialState,newTask} from '../src/domain.js';
import {defaultWeek} from '../src/core/weekly-planner.js';
import {chooseOption} from './select-helper.js';
const date='2026-11-27';
const mk=(id,fields={})=>({...newTask(id,'inbox',date,id),createdAt:new Date(date+'T07:00').toISOString(),...fields});
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')));
async function seed(page,tasks,{end='11:15',week=true,clock='08:00'}={}){
 await page.clock.setFixedTime(new Date(date+'T'+clock));
 const s={...initialState(),tasks};
 const rows=defaultWeek().map(d=>({...d,start:'09:00',end}));
 await page.addInitScript(({s,end,rows,week})=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(s));localStorage.setItem('todo-planner-preferences-v1',JSON.stringify({workStart:'09:00',workEnd:end}));if(week)localStorage.setItem('todo-weekly-hours-v1',JSON.stringify(rows))},{s,end,rows,week});
 await page.goto('/');await page.getByRole('button',{name:'每日规划',exact:true}).click();await page.getByLabel('规划日期').fill(date);
}
test('碎片修复、余量改变及实际保存',async({page})=>{
 await seed(page,[mk('固定',{time:'10:00',duration:30,planLocked:true,planMinutes:30}),mk('任务A',{priority:3,duration:45,deadline:date+'T11:15'}),mk('任务B',{priority:2,duration:60,deadline:date+'T11:15'})]);
 await page.getByRole('button',{name:'智能安排',exact:true}).click();const d=page.getByRole('dialog',{name:'智能时间安排'});
 await expect(d).toContainText('09:00');await expect(d).toContainText('10:30');await expect(d).toContainText('建议 105');
 await chooseOption(d.getByRole('combobox',{name:'规划预留余量'}),'20');await expect(d).toContainText('已预留 21');
 await chooseOption(d.getByRole('combobox',{name:'规划预留余量'}),'0');await expect(d).toContainText('建议 105');
 await page.setViewportSize({width:390,height:844});await expect(d.getByRole('button',{name:'应用安排'})).toBeVisible();const size=await d.evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));expect(size.scroll).toBeLessThanOrEqual(size.width+1);await page.screenshot({path:'test-results/planning-quality-mobile.png'});
 await d.getByRole('button',{name:'应用安排'}).click();
 await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='任务B').time).toBe('09:00');const s=await stored(page);expect(s.tasks.find(t=>t.id==='任务A').time).toBe('10:30');expect(s.tasks.find(t=>t.id==='固定').time).toBe('10:00');
});
test('当前时刻变化使旧预览失效，不提交已经过去的时间块',async({page})=>{
 await seed(page,[mk('固定',{time:'10:00',duration:30,planLocked:true,planMinutes:30}),mk('任务A',{priority:3,duration:45,deadline:date+'T11:15'}),mk('任务B',{priority:2,duration:60,deadline:date+'T11:15'})]);
 await page.getByRole('button',{name:'智能安排',exact:true}).click();const d=page.getByRole('dialog',{name:'智能时间安排'});
 await expect(d).toContainText('建议 105');await page.clock.setFixedTime(new Date(date+'T09:01'));
 await d.getByRole('button',{name:'应用安排'}).click();await expect(d.getByRole('status')).toContainText('时间或数据变化');
 expect((await stored(page)).tasks.filter(t=>t.id!=='固定').every(t=>!t.time)).toBe(true);
 await d.getByRole('button',{name:'应用安排'}).click();await expect.poll(async()=>(await stored(page)).tasks.find(t=>t.id==='任务A').time).toBeTruthy();
 const saved=(await stored(page)).tasks.find(t=>t.id==='任务A');expect(saved.time>='09:01').toBe(true);expect(Date.parse(saved.date+'T'+saved.time)+saved.planMinutes*60000).toBeLessThanOrEqual(Date.parse(date+'T11:15'));
 expect((await stored(page)).tasks.find(t=>t.id==='任务B').time).toBe('');
});
test('默认工作周约束、显式忽略及多段总工时守恒',async({page})=>{
 await seed(page,[mk('多段',{duration:150})],{end:'10:00'});
 await chooseOption(page.getByRole('combobox',{name:'智能规划范围'}),'7');await page.getByRole('button',{name:'智能安排',exact:true}).click();const d=page.getByRole('dialog',{name:'智能时间安排'});
 await expect(d).toContainText('2026-11-30 09:00');await expect(d).toContainText('2026-12-01 09:00');await expect(d).toContainText('2026-11-28 · 休息日');
 await d.getByRole('checkbox',{name:'本规划会话忽略已保存工作周'}).check();await expect(d).toContainText('2026-11-28 09:00');
 await d.getByRole('checkbox',{name:'本规划会话忽略已保存工作周'}).uncheck();await expect(d).toContainText('2026-11-30 09:00');
 await d.getByRole('button',{name:'应用安排'}).click();await expect.poll(async()=>(await stored(page)).tasks[0].planSegments?.length).toBe(2);
 const t=(await stored(page)).tasks[0];expect(t.planMinutes+t.planSegments.reduce((n,s)=>n+s.minutes,0)).toBe(150);expect(t.planSegments.map(s=>s.date)).toEqual(['2026-11-30','2026-12-01']);
});
