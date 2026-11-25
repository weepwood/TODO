import {test,expect,devices} from '@playwright/test';
test('模拟 Android 原生入口：SQLite 持久化、移动导航、通知授权与桌面 IPC 隔离',async({browser})=>{
 const ctx=await browser.newContext({...devices['Pixel 7'],baseURL:'http://127.0.0.1:4178'});
 try{const page=await ctx.newPage();await page.addInitScript(()=>{
  window.isTauri=true;window.__calls=[];window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{
   window.__calls.push(cmd);if(cmd==='native_load_store')return localStorage.getItem('qa-mobile-store');
   if(cmd==='native_write_store'){localStorage.setItem('qa-mobile-store',args.store);return null}
   if(cmd==='plugin:notification|is_permission_granted')return false;
   if(cmd==='plugin:notification|request_permission')return 'granted';
   return null;
  }};
 });
 await page.goto('/');await expect(page.locator('.native-mobile')).toBeVisible();await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();
 const rail=page.locator('.rail');expect(await rail.evaluate(el=>getComputedStyle(el).flexDirection)).toBe('row');const r=await rail.boundingBox(),m=await page.locator('main').boundingBox();expect(r.y).toBeGreaterThanOrEqual(m.y+m.height-2);
 await page.getByRole('textbox',{name:'新任务名称'}).fill('Android 积分验收 积分+10');await page.getByRole('button',{name:'添加',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('qa-mobile-store'))['todo-workbench-v1']).tasks.length)).toBe(1);
 await page.reload();await expect(page.locator('.task-body').filter({hasText:'Android 积分验收'})).toBeVisible();
 await rail.getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByText('桌面快捷操作',{exact:true})).toHaveCount(0);await expect(page.getByText(/后台定时通知与后台同步尚未实现/)).toBeVisible();
 await page.getByRole('button',{name:'发送系统测试提醒'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls.includes('native_test_notification'))).toBe(true);
 const calls=await page.evaluate(()=>window.__calls);expect(calls).toContain('plugin:notification|request_permission');expect(calls.some(x=>/native_(take_quick_capture|shortcut_status|open_capture|direct_pending|exit)/.test(x))).toBe(false);
 await page.keyboard.press('Escape');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/android-shell-mock.png',animations:'disabled'});
 }finally{await ctx.close()}
});
