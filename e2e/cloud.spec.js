import {test,expect} from '@playwright/test';
const uid='00000000-0000-4000-8000-000000000009';
const host='https://xepkhnatnpvopnlqnrrz.supabase.co';
const key='sb-xepkhnatnpvopnlqnrrz-auth-token';
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
test('账号隔离、双设备拉取、离线修改与冲突保护（模拟 API）',async({browser})=>{
 const expires=Math.floor(Date.now()/1000)+3600;
 const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,exp:expires,role:'authenticated'})+'.mock';
 const session={access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,expires_at:expires,user:{id:uid,email:'test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}};
 let row=null;
 const contexts=[];
 async function device(){
  const ctx=await browser.newContext();contexts.push(ctx);
  await ctx.addInitScript(({key,session})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(session))},{key,session});
  await ctx.route(host+'/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.pathname==='/auth/v1/user')return route.fulfill({json:session.user});
   if(!url.pathname.endsWith('/todo_workspaces'))return route.fulfill({status:404,json:{message:'mock route'}});
   if(req.method()==='GET')return route.fulfill({json:row?[row]:[]});
   const body=req.postDataJSON();
   if(req.method()==='POST'){if(row)return route.fulfill({status:409,json:{code:'23505',message:'duplicate'}});row={...body,updated_at:new Date().toISOString()}}
   else if(req.method()==='PATCH'){if(!row||url.searchParams.get('revision')!=='eq.'+row.revision)return route.fulfill({status:406,json:{code:'PGRST116',details:'The result contains 0 rows',message:'Cannot coerce the result to a single JSON object'}});row={...row,...body,updated_at:new Date().toISOString()}}
   return route.fulfill({json:{revision:row.revision,updated_at:row.updated_at}});
  });
  const page=await ctx.newPage();await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();return {ctx,page}
 }
 async function add(page,name){await page.getByRole('textbox',{name:'新任务名称'}).fill(name);await page.getByRole('button',{name:'添加',exact:true}).click()}
 try{
  const a=await device();await expect(a.page.locator('.sync-footer')).toContainText('云端工作空间为空');
  await add(a.page,'设备 A 原始任务');await expect.poll(()=>row?.state.tasks.some(t=>t.title==='设备 A 原始任务')).toBe(true);
  const b=await device();await expect(b.page.locator('.task-body').filter({hasText:'设备 A 原始任务'})).toBeVisible({timeout:12000});
  await b.ctx.setOffline(true);await add(b.page,'设备 B 离线修改');await expect(b.page.locator('.sync-footer')).toContainText('离线');
  await add(a.page,'设备 A 在线修改');await expect.poll(()=>row?.state.tasks.some(t=>t.title==='设备 A 在线修改')).toBe(true);
  await b.ctx.setOffline(false);await expect(b.page.locator('.sync-footer')).toContainText('存在同步冲突',{timeout:12000});
  expect(row.state.tasks.some(t=>t.title==='设备 B 离线修改')).toBe(false);
  await expect(b.page.locator('.task-body').filter({hasText:'设备 B 离线修改'})).toBeVisible();
  await b.page.getByRole('button',{name:'设置',exact:true}).click();
  b.page.once('dialog',d=>d.accept());await b.page.getByRole('button',{name:'使用云端版本'}).click();
  await expect(b.page.locator('.sync-footer')).toContainText('已同步',{timeout:12000});
  expect(await b.page.evaluate(uid=>JSON.parse(localStorage.getItem('todo-account:'+uid+':todo-conflict-backup')).tasks.some(t=>t.title==='设备 B 离线修改'),uid)).toBe(true);
 }finally{await Promise.all(contexts.map(c=>c.close()))}
});
