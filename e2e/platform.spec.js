import {test,expect,devices} from '@playwright/test';
test('模拟 Android 原生入口：SQLite 持久化、移动导航、通知授权与桌面 IPC 隔离',async({browser})=>{
 const ctx=await browser.newContext({...devices['Pixel 7'],baseURL:'http://127.0.0.1:4178'});
 try{const page=await ctx.newPage();await page.addInitScript(()=>{
  window.isTauri=true;window.__calls=[];window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{
   window.__calls.push(cmd);if(cmd==='plugin:todo-mobile|session_read')return {value:null};if(cmd==='plugin:notification|get_pending')return [];if(cmd==='native_load_store')return localStorage.getItem('qa-mobile-store');
   if(cmd==='native_write_store'){localStorage.setItem('qa-mobile-store',args.store);return null}
   if(cmd==='plugin:notification|is_permission_granted')return false;
   if(cmd==='plugin:notification|request_permission')return 'granted';
   return null;
  }};
 });
 await page.goto('/');await expect(page.locator('.native-mobile')).toBeVisible();await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();
 const rail=page.locator('.rail');expect(await rail.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(5);const r=await rail.boundingBox(),m=await page.locator('main').boundingBox();expect(r.y).toBeGreaterThanOrEqual(m.y+m.height-2);
 await page.getByRole('textbox',{name:'新任务名称'}).fill('Android 积分验收 积分+10');await page.getByRole('button',{name:'添加',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('qa-mobile-store'))['todo-workbench-v1']).tasks.length)).toBe(1);
 await expect(page.locator('.details').getByRole('textbox',{name:'任务标题'})).toHaveValue('Android 积分验收');
 await expect(page.locator('.details').getByRole('spinbutton',{name:'任务积分'})).toHaveValue('10');
 await expect.poll(()=>page.evaluate(()=>window.__todoAndroidBack())).toBe(true);
 await expect(page.locator('.details')).toHaveCount(0);
 await page.reload();await expect(page.locator('.task-body').filter({hasText:'Android 积分验收'})).toBeVisible();
 await rail.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'提醒',exact:true}).click();await expect(page.getByText('桌面快捷操作',{exact:true})).toHaveCount(0);await expect(page.getByText(/后台同步尚未实现/)).toBeVisible();
 await page.getByRole('button',{name:'发送系统测试提醒'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls.includes('native_test_notification'))).toBe(true);
 const calls=await page.evaluate(()=>window.__calls);expect(calls).toContain('plugin:notification|request_permission');expect(calls.some(x=>/native_(take_quick_capture|shortcut_status|open_capture|direct_pending|exit)/.test(x))).toBe(false);
 await expect.poll(()=>page.evaluate(()=>window.__todoAndroidBack())).toBe(true);await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/android-shell-mock.png',animations:'disabled'});
 }finally{await ctx.close()}
});
