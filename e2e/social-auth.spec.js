import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
const host=(process.env.VITE_SUPABASE_URL||'https://xepkhnatnpvopnlqnrrz.supabase.co').replace(/\/+$/,'');
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
for(const provider of ['github','google'])test('Web '+provider+' OAuth uses SDK PKCE and preserves guest scope (mock provider)',async({browser})=>{
 const ctx=await browser.newContext(),uid='00000000-0000-4000-8000-000000000099';
 const user={id:uid,email:'oauth-test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{provider},user_metadata:{},created_at:new Date().toISOString()};
 const expiry=Math.floor(Date.now()/1000)+3600,access_token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,exp:expiry,role:'authenticated'})+'.mock';
 let challenge=null,exchanged=false;
 try{
  await ctx.routeWebSocket('**/realtime/v1/websocket**',ws=>ws.close());
  await ctx.route(host+'/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.pathname.endsWith('/settings'))return route.fulfill({json:{external:{github:provider==='github',google:provider==='google'}}});
   if(url.pathname.endsWith('/authorize')){
    expect(url.searchParams.get('provider')).toBe(provider);expect(url.searchParams.get('code_challenge_method')).toBe('s256');challenge=url.searchParams.get('code_challenge');
    const redirect=new URL(url.searchParams.get('redirect_to'));redirect.searchParams.set('code','isolated-mock-code');
    return route.fulfill({status:302,headers:{location:redirect.href}});
   }
   if(url.pathname.endsWith('/token')){
    expect(url.searchParams.get('grant_type')).toBe('pkce');const body=req.postDataJSON();
    expect(body.auth_code).toBe('isolated-mock-code');expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(challenge);
    exchanged=true;return route.fulfill({json:{access_token,refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,expires_at:expiry,user}});
   }
   if(url.pathname.endsWith('/user'))return route.fulfill({json:user});
   if(url.pathname.endsWith('/todo_workspaces'))return route.fulfill({json:[]});
   return route.fulfill({status:404,json:{message:'mock only'}});
  });
  const page=await ctx.newPage();await page.goto('http://127.0.0.1:4178/');
  await page.getByRole('textbox',{name:'新任务名称'}).fill('访客独立任务');
  await page.getByRole('button',{name:'添加',exact:true}).click();
  await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();
  const labels={github:'使用 GitHub 登录',google:'使用 Google 登录'};
  await expect(page.getByRole('button',{name:labels[provider]})).toBeEnabled();
  await expect(page.getByRole('button',{name:labels[provider==='github'?'google':'github']})).toBeDisabled();
  await page.getByRole('button',{name:labels[provider]}).click();
  await expect(page.locator('.sync-footer')).toContainText(/云端工作空间为空|已同步/,{timeout:15000});
  expect(exchanged).toBe(true);expect(new URL(page.url()).searchParams.has('code')).toBe(false);
  await expect(page.locator('.task-body').filter({hasText:'访客独立任务'})).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('todo-workbench-v1')).tasks.some(t=>t.title==='访客独立任务'))).toBe(true);
 }finally{await ctx.close()}
});
