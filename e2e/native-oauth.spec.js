import {test,expect,devices} from '@playwright/test';
import {createHash} from 'node:crypto';
const host=(process.env.VITE_SUPABASE_URL||'https://xepkhnatnpvopnlqnrrz.supabase.co').replace(/\/+$/,'');
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
for(const android of [false,true])test('Native '+(android?'Android':'desktop')+' OAuth simulated IPC callback and guest isolation',async({browser})=>{
 const ctx=await browser.newContext(android?{...devices['Pixel 7']}:{viewport:{width:1440,height:900}});
 const uid='00000000-0000-4000-8000-000000000089',expiry=Math.floor(Date.now()/1000)+3600;
 const access_token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,exp:expiry,role:'authenticated'})+'.mock';
 const user={id:uid,email:'native-oauth@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider:'github'},user_metadata:{},created_at:new Date().toISOString()};
 let calls=0,challenge='';
 try{
  await ctx.routeWebSocket('**/realtime/v1/websocket**',ws=>ws.close());
  await ctx.route(host+'/**',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.pathname.endsWith('/settings'))return route.fulfill({json:{external:{github:true,google:true,azure:true}}});
   if(u.pathname.endsWith('/token')){
    calls++;expect(u.searchParams.get('grant_type')).toBe('pkce');
    const b=req.postDataJSON();expect(b.auth_code).toBe('fixture-code');expect(createHash('sha256').update(b.code_verifier).digest('base64url')).toBe(challenge);
    return route.fulfill({json:{access_token,refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,expires_at:expiry,user}});
   }
   if(u.pathname.endsWith('/user'))return route.fulfill({json:user});
   if(u.pathname.endsWith('/todo_workspaces'))return route.fulfill({json:[]});
   return route.fulfill({status:404,json:{message:'mock only'}});
  });
  const page=await ctx.newPage();
  await page.addInitScript(()=>{
   window.isTauri=true;let next=0;const callbacks=new Map(),listeners=new Map();
   window.__opened=[];window.__sessionKeys=[];
   window.__returnOAuth=raw=>{for(const [id,entry] of listeners)if(entry.event==='deep-link://new-url')callbacks.get(entry.handler)?.({event:entry.event,id,payload:[raw]})};
   window.__TAURI_INTERNALS__={transformCallback:fn=>{callbacks.set(++next,fn);return next},unregisterCallback:id=>callbacks.delete(id),invoke:async(cmd,args)=>{
    if(cmd==='plugin:event|listen'){listeners.set(++next,args);return next}
    if(cmd==='plugin:event|unlisten'){listeners.delete(args.eventId);return null}
    if(cmd==='plugin:opener|open_url'){window.__opened.push(args.url);return null}
    if(cmd==='native_load_store')return localStorage.getItem('qa-native-'+args.scope);
    if(cmd==='native_write_store'){localStorage.setItem('qa-native-'+args.scope,args.store);return null}
    if(cmd==='plugin:todo-mobile|session_read')return {value:localStorage.getItem('qa-vault-'+args.key)};
    if(cmd==='plugin:todo-mobile|session_write'){window.__sessionKeys.push(args.key);localStorage.setItem('qa-vault-'+args.key,args.value);return null}
    if(cmd==='plugin:todo-mobile|session_remove'){localStorage.removeItem('qa-vault-'+args.key);return null}
    if(cmd==='plugin:notification|get_pending')return [];
    if(cmd==='plugin:notification|is_permission_granted')return false;
    return null;
   }};
  });
  await page.goto('http://127.0.0.1:4178/');
  await page.getByRole('textbox',{name:'新任务名称'}).fill('原生访客独立任务');
  await page.getByRole('button',{name:'添加',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('qa-native-guest'))['todo-workbench-v1']).tasks.length)).toBe(1);
  if(android){await page.getByRole('button',{name:'关闭详情'}).click();await expect(page.getByRole('complementary',{name:'任务详情'})).toHaveCount(0);await page.locator('.rail').getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'设置',exact:true}).click()}
  else await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();
  await expect(page.getByRole('button',{name:'使用 Microsoft 登录'})).toHaveCount(0);
  const btn=page.getByRole('button',{name:'使用 GitHub 登录'});await expect(btn).toBeEnabled();
  await btn.click();await expect(page.getByRole('button',{name:'取消授权'})).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.__opened.length)).toBe(1);
  await page.getByRole('button',{name:'取消授权'}).click();
  await page.evaluate(()=>window.__returnOAuth('com.weepwood.todo://auth/callback?code=fixture-code'));expect(calls).toBe(0);
  await btn.click();await expect.poll(()=>page.evaluate(()=>window.__opened.length)).toBe(2);
  await page.getByRole('dialog',{name:'设置与数据管理'}).getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'设置与数据管理'})).toHaveCount(0);
  await page.evaluate(()=>window.__returnOAuth('com.weepwood.todo://auth/callback?code=fixture-code'));
  expect(calls).toBe(0);
  if(android){await page.locator('.rail').getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'设置',exact:true}).click()}
  else await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();
  await expect(btn).toBeEnabled();await btn.click();await expect.poll(()=>page.evaluate(()=>window.__opened.length)).toBe(3);
  const u=new URL(await page.evaluate(()=>window.__opened[2]));expect(u.origin).toBe(host);expect(u.searchParams.get('provider')).toBe('github');expect(u.searchParams.get('redirect_to')).toBe('com.weepwood.todo://auth/callback');expect(u.searchParams.get('code_challenge_method')).toBe('s256');challenge=u.searchParams.get('code_challenge');
  await page.evaluate(()=>{window.__returnOAuth('https://auth/callback?code=fixture-code');window.__returnOAuth('com.weepwood.todo://auth/callback?code=fixture-code');window.__returnOAuth('com.weepwood.todo://auth/callback?code=fixture-code')});
  await expect(page.locator('.sync-footer')).toContainText(/云端工作空间为空|已同步/,{timeout:15000});
  expect(calls).toBe(1);await expect(page.locator('.task-body').filter({hasText:'原生访客独立任务'})).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(JSON.parse(localStorage.getItem('qa-native-guest'))['todo-workbench-v1']).tasks.some(t=>t.title==='原生访客独立任务'))).toBe(true);
  if(android)expect(await page.evaluate(()=>window.__sessionKeys)).toContain('todo-android-auth-v1-code-verifier');
 }finally{await ctx.close()}
});
