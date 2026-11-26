import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,STORAGE_KEY} from '../src/domain.js';
import {mkdirSync,writeFileSync} from 'node:fs';

test.skip(process.env.TODO_SUSTAINED!=='1','Explicit sustained-session resource budget required');
test('千级完整字段工作空间持续运行与周期性修改',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','Requires CDP heap samples');test.setTimeout(150000);
 const d=initialState();d.tasks=Array.from({length:1000},(_,i)=>newTask('长时任务 '+i,'inbox',dayKey(),'sustain-'+i));
 await page.addInitScript(({d,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(d))},{d,key:STORAGE_KEY});
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 const rail=page.locator('.rail'),cycle=async()=>{for(const [label,selector] of [['日历','.calendar-main'],['统计','.stat-grid'],['每日规划','.planner'],['任务','.quick-add']]){await rail.getByRole('button',{name:label,exact:true}).click();await expect(page.locator(selector).first()).toBeVisible()}};
 await cycle();const cdp=await context.newCDPSession(page),samples=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const sample=async(i)=>{await cdp.send('HeapProfiler.collectGarbage');const {usedSize,totalSize}=await cdp.send('Runtime.getHeapUsage');samples.push({cycle:i,elapsedMs:performance.now()-start,usedSize,totalSize,domNodes:await page.evaluate(()=>document.getElementsByTagName('*').length)})};
 const start=performance.now();await sample(0);
 for(let i=1;i<=12;i++){await cycle();if(i%3===0){const input=page.getByRole('textbox',{name:'新任务名称'});await input.fill('持续运行新增 '+i);await input.press('Enter');await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).tasks.length,STORAGE_KEY)).toBe(1000+i/3)}await page.waitForTimeout(5000);if(i%3===0)await sample(i)}
 const result={tasks:1000,added:4,switches:48,elapsedMs:performance.now()-start,samples,errors,method:'12 cycles, 5s dwell each, full default task fields, GC every third cycle; not hours-long stability proof'};
 expect(errors).toEqual([]);mkdirSync('test-results',{recursive:true});writeFileSync('test-results/sustained-session.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
});
