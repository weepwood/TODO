import {test,expect} from '@playwright/test';
import {initialState,newTask,STORAGE_KEY,dayKey} from '../src/domain.js';
test('普通生产工作线程声明旧存储协议且不触发试验迁移',async({page,context})=>{
 const d={...initialState(),tasks:[newTask('协议保留任务','inbox',dayKey(),'protocol-task')]};
 await page.addInitScript(({d,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(d))},{d,key:STORAGE_KEY});
 await page.goto('/');await expect(page.locator('.task-body').filter({hasText:'协议保留任务'})).toBeVisible();
 await page.evaluate(()=>navigator.serviceWorker.ready);await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 const worker=await page.evaluate(()=>new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('worker protocol timeout')),3000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data)};navigator.serviceWorker.controller.postMessage({type:'TODO_STORAGE_PROTOCOL'},[channel.port2])}));
 expect(worker.mode).toBe('legacy');expect(worker.version).toBe(1);expect(worker.build).toMatch(/^[a-f0-9]{16}$/);
 await context.setOffline(true);await page.reload();await expect(page.locator('.task-body').filter({hasText:'协议保留任务'})).toBeVisible();await context.setOffline(false);
 expect(await page.evaluate(()=>localStorage.getItem('todo-shard-switch-protocol'))).toBeNull();
});
