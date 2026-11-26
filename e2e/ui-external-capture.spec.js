import {test,expect} from '@playwright/test';
import {STORAGE_KEY} from '../src/core/domain.js';
const host='https://todo-ai-qa.invalid';
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
test('外部录入设置审批、真实PG云端回执及双浏览器持久化',async({browser})=>{
 test.skip(process.env.TODO_EXTERNAL_E2E!=='1','requires isolated API-enabled build and integration dependencies');
 test.setTimeout(90000);
 const {localFixture,ownerA}=await import('../integrations/ai/local-fixture.mjs');
 const f=await localFixture(),contexts=[];
 try{
  const expires=Math.floor(Date.now()/1000)+3600,token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:ownerA,exp:expires,role:'authenticated'})+'.synthetic';
  const session={access_token:token,refresh_token:'qa-refresh',token_type:'bearer',expires_in:3600,expires_at:expires,user:{id:ownerA,email:'qa@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}};
  f.secrets.set(token,ownerA);
  async function device(){
   const ctx=await browser.newContext();contexts.push(ctx);
   await ctx.routeWebSocket('**/realtime/v1/websocket**',ws=>ws.close());
   await ctx.addInitScript(({session})=>{if(!localStorage.getItem('sb-todo-ai-qa-auth-token'))localStorage.setItem('sb-todo-ai-qa-auth-token',JSON.stringify(session))},{session});
   await ctx.route('https://**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==host)return route.abort();
    if(url.pathname==='/auth/v1/user')return route.fulfill({json:session.user});
    if(url.pathname.startsWith('/functions/v1/todo-external/')){
     const res=await fetch(f.base+url.pathname,{method:req.method(),headers:{authorization:req.headers().authorization,'content-type':'application/json'},body:req.postData()??undefined});
     return route.fulfill({status:res.status,json:await res.json()});
    }
    if(url.pathname.endsWith('/rpc/todo_read_task_deltas'))return route.fulfill({json:null}); // exercise full authoritative fallback
    if(url.pathname.endsWith('/todo_workspaces')&&req.method()==='GET'){
     expect(url.searchParams.get('user_id')).toBe('eq.'+ownerA);
     const r=await f.row(ownerA),row={revision:Number(r.revision),updated_at:r.updated_at.toISOString(),state:r.state};
     return route.fulfill({json:[url.searchParams.get('select')==='revision,updated_at'?{revision:row.revision,updated_at:row.updated_at}:row]});
    }
    // No browser writes permitted in this fixture: only the actual API gateway creates tasks.
    return route.fulfill({status:403,json:{message:'unexpected fixture request'}});
   });
   const page=await ctx.newPage();await page.goto('/');await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible();
   await expect(page.locator('.sync-footer')).toContainText('已同步',{timeout:15000});
   return page;
  }
  const a=await device(),b=await device();
  const open=async page=>{await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'管理外部接入'}).click();await expect(page.getByRole('textbox',{name:'外部工具名称'})).toBeVisible()};
  await open(a);
  await a.getByRole('textbox',{name:'外部工具名称'}).fill('合成 Codex');
  await a.getByRole('button',{name:'生成令牌'}).click();
  const secret=a.getByRole('textbox',{name:'新访问令牌'});await expect(secret).toBeVisible();
  const manual=await secret.inputValue();expect(manual).toMatch(/^todo_[a-f0-9]{64}$/);
  const pending=await f.api(manual,'/v1/tasks',{title:'外部审批任务',notes:'合成备注',listId:'inbox'},'browser-manual');
  expect(pending.code).toBe(202);expect((await f.row(ownerA)).state.tasks).toHaveLength(0);
  await a.getByRole('button',{name:'刷新',exact:true}).click();
  await expect(a.getByText('外部审批任务',{exact:true})).toBeVisible();
  await a.getByRole('button',{name:'确认创建',exact:true}).click();
  await expect(a.getByText('已保存到云端，等待本机同步',{exact:true})).toBeVisible();
  await a.keyboard.press('Escape');
  const pull=async page=>{await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'立即同步'}).click();await page.keyboard.press('Escape')};
  await pull(b);
  const persisted=async(page,title)=>expect.poll(()=>page.evaluate(({uid,key,title})=>JSON.parse(localStorage.getItem('todo-account:'+uid+':'+key)||'{}').tasks?.filter(t=>t.title===title).length||0,{uid:ownerA,key:STORAGE_KEY,title}),{timeout:20000}).toBe(1);
  await persisted(a,'外部审批任务');await persisted(b,'外部审批任务');
  expect((await f.api(manual,'/v1/requests/'+pending.body.id)).body.status).toBe('saved');
  await open(a);await a.getByRole('textbox',{name:'外部工具名称'}).fill('合成自动工具');await a.getByRole('checkbox',{name:'允许该工具直接自动创建任务'}).check();await a.getByRole('button',{name:'生成令牌'}).click();
  await expect(secret).toBeVisible();const auto=await secret.inputValue();await a.keyboard.press('Escape');
  const saved=await f.api(auto,'/v1/tasks/batch',[{title:'自动录入甲'},{title:'自动录入乙',priority:3}],'browser-auto');
  expect(saved.body.status).toBe('saved');expect(saved.body.task_ids).toHaveLength(2);
  await pull(a);await pull(b);await persisted(a,'自动录入甲');await persisted(b,'自动录入乙');
  const stored=await f.row(ownerA);expect(stored.state.tasks).toHaveLength(3);
  await a.reload();await persisted(a,'自动录入甲');
  console.log('actual PostgreSQL receipt + two isolated browser localStorage readbacks; synthetic Auth/REST transport');
 }finally{for(const c of contexts)await c.close();await f.close()}
});
