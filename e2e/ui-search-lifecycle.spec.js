import {test,expect} from '@playwright/test';
import {initialState,dayKey} from '../src/domain.js';
import {mkdirSync,writeFileSync} from 'node:fs';
test('万级搜索立即打开与重复生命周期采样',async({browser,browserName})=>{
 test.skip(browserName!=='chromium','CDP GC and heap metrics');test.setTimeout(90000);
 const ctx=await browser.newContext({baseURL:'http://127.0.0.1:4178',serviceWorkers:'block',reducedMotion:'reduce'});
 try{const page=await ctx.newPage(),d=initialState(),date=dayKey();d.tasks=Array.from({length:10000},(_,i)=>({id:'life-'+i,title:'生命周期任务 '+String(i).padStart(5,'0'),notes:'',listId:'inbox',date,priority:0,repeat:'none',miss:'keep',anchor:+date.slice(-2),seriesId:null,checklist:[],status:'pending',createdAt:date+'T00:00:00.000Z',completedAt:null}));
 await page.addInitScript(d=>{if(!localStorage.getItem('todo-workbench-v1'))localStorage.setItem('todo-workbench-v1',JSON.stringify(d))},d);
 // Artificial network delay makes the on-demand path deterministic, independent of idle timing.
 let delay=true;await page.route('**/assets/command-palette-*.js',async route=>{if(delay)await new Promise(r=>setTimeout(r,300));await route.continue()});
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')||'{}').tasks?.length)).toBe(10000);const trigger=page.getByRole('button',{name:'全局搜索',exact:true}),input=page.getByRole('combobox',{name:'搜索命令与任务'}),dialog=page.getByRole('dialog',{name:'命令面板'});
 const start=performance.now();await trigger.click();await expect(input).toBeFocused();const openMs=performance.now()-start;delay=false;
 const find=async(i)=>{const title='生命周期任务 '+String(i).padStart(5,'0'),begin=performance.now();await input.fill(title);await expect(dialog.getByRole('option').filter({hasText:title})).toBeVisible();return performance.now()-begin};
 const firstQueryMs=await find(9999);await input.press('Escape');await expect(dialog).toHaveCount(0);
 const cdp=await ctx.newCDPSession(page),heap=[];const sample=async(cycle)=>{await cdp.send('HeapProfiler.collectGarbage');const {usedSize,totalSize}=await cdp.send('Runtime.getHeapUsage');heap.push({cycle,usedSize,totalSize})};await sample(0);
 const warm=[];for(let i=1;i<=30;i++){const begin=performance.now();await trigger.click();await expect(input).toBeFocused();const open=performance.now()-begin,query=await find(9999-i);warm.push({openMs:open,queryMs:query});await input.press('Escape');await expect(dialog).toHaveCount(0);if(i%10===0)await sample(i)}
 const result={count:10000,openMs,firstQueryMs,warm,heap,method:'fresh context; optional 300ms artificial module delay, click to focused input, fill to matching option; 30 cycles, CDP forced GC every 10; short stress sample, not long-term leak proof'};
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/search-lifecycle.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await ctx.close()}
});
