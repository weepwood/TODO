import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,STORAGE_KEY,BACKUP_KEY} from '../src/domain.js';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
test('真实浏览器完整默认字段容量与备份边界',async({page,browserName})=>{
 const key=STORAGE_KEY,backup=BACKUP_KEY,date=dayKey(),rows=[];
 // Unique isolated Playwright origin; no real profile or app data.
 await page.route('**/capacity-probe',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Capacity probe</title>'}));
 await page.goto('/capacity-probe');
 for(const count of [1000,4000,10000]){
  const d=initialState();d.tasks=Array.from({length:count},(_,i)=>newTask('容量任务 '+i,'inbox',date,'capacity-'+i));const raw=JSON.stringify(d),next=JSON.stringify({...d,theme:'dark'});
  const result=await page.evaluate(({key,backup,raw,next})=>{
   const storage=localStorage;storage.removeItem(key);storage.removeItem(backup);
   let phase='primary',error=null;
   try{storage.setItem(key,raw);phase='backup';storage.setItem(backup,raw);phase='update';storage.setItem(key,next);phase='complete'}catch(e){error=e.name}
   return {phase,error,primaryPreserved:storage.getItem(key)===raw||storage.getItem(key)===next,backupPreserved:storage.getItem(backup)===raw};
  },{key,backup,raw,next});
  if(result.phase!=='primary')expect(result.primaryPreserved).toBe(true);
  if(result.phase==='complete')expect(result.backupPreserved).toBe(true);
  rows.push({count,characters:raw.length,utf8Bytes:Buffer.byteLength(raw),...result});
 }
 expect(rows[0].phase).toBe('complete');
 mkdirSync('test-results',{recursive:true});writeFileSync('test-results/full-capacity-'+browserName+'.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
});
test('保存失败保留持久数据、直接导出草稿及显式重试',async({page})=>{
 const d=initialState();d.tasks=[newTask('原有数据','inbox',dayKey(),'original')];
 await page.addInitScript(({d,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(d));const set=Storage.prototype.setItem;window.__todoQuota=false;Storage.prototype.setItem=function(k,v){if(window.__todoQuota&&k===key)throw new DOMException('quota test','QuotaExceededError');return set.call(this,k,v)}},{d,key:STORAGE_KEY});
 await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();
 const old=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);await page.evaluate(()=>window.__todoQuota=true);
 const input=page.getByRole('textbox',{name:'新任务名称'});await input.fill('尚未保存的任务');await input.press('Enter');
 const alert=page.getByRole('alert').filter({hasText:'本地存储空间不足'});await expect(alert).toBeVisible();await expect(page.locator('.task-row').filter({hasText:'尚未保存的任务'})).toBeVisible();
 expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(old);
 expect(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented})).toBe(true);
 const dl=page.waitForEvent('download');await alert.getByRole('button',{name:'导出当前数据'}).click();const path=await (await dl).path();expect(JSON.parse(readFileSync(path,'utf8')).tasks.map(t=>t.title)).toContain('尚未保存的任务');
 await alert.getByRole('button',{name:'数据管理'}).click();const settings=page.getByRole('dialog',{name:'设置与数据管理'});await expect(settings.getByText('本地数据尚未安全保存，暂不可切换账号。',{exact:false})).toBeVisible();await expect(settings.getByRole('button',{name:'登录',exact:true})).toBeDisabled();await settings.getByRole('button',{name:'关闭',exact:true}).click();
 await page.evaluate(()=>window.__todoQuota=false);await alert.getByRole('button',{name:'重试保存'}).click();await expect(alert).toHaveCount(0);
 await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).tasks.some(t=>t.title==='尚未保存的任务'),STORAGE_KEY)).toBe(true);
 expect(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented})).toBe(false);
});
