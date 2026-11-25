import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
import {writeFileSync,mkdirSync} from 'node:fs';
for(const count of [1000,10000])test('synthetic workspace '+count,async({page,browserName})=>{
 test.setTimeout(60000);
 const data=initialState(),today=dayKey();
 data.tasks=Array.from({length:count},(_,i)=>newTask('基准任务 '+String(i).padStart(5,'0'),'inbox',today));
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},data);
 const start=performance.now();await page.goto('/');await expect(page.locator('.task-row').first()).toBeVisible();
 const first=performance.now()-start,rendered=await page.locator('.task-row').count();
 expect(rendered).toBeLessThan(count);
 const samples=[];
 for(let i=0;i<5;i++){
  const title='基准任务 '+String(count-1-i).padStart(5,'0');
  await page.getByRole('button',{name:'全局搜索',exact:true}).click();
  const input=page.getByRole('combobox',{name:'搜索命令与任务'}),begin=performance.now();
  await input.fill(title);
  await expect(page.getByRole('option').filter({hasText:title})).toBeVisible();
  samples.push(performance.now()-begin);await page.keyboard.press('Escape');
 }
 const memory=await page.evaluate(()=>performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize}:null);
 const result={count,browser:browserName,firstVisibleMs:first,renderedRows:rendered,searchSamplesMs:samples,searchP95Ms:[...samples].sort((a,b)=>a-b)[Math.ceil(samples.length*.95)-1],memory,method:'navigation to first visible row; fill to matching option visible; 5 samples; JS heap snapshot only'};
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/performance-'+count+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 await page.screenshot({path:'test-results/performance-'+count+'.png',animations:'disabled'});
});
