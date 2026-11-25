import {chooseOption} from './select-helper.js';
import {test,expect} from '@playwright/test';
const uid='00000000-0000-4000-8000-000000000009';
// Match the isolated Vite build configuration used by CI and local builds.
const host=(process.env.VITE_SUPABASE_URL||'https://xepkhnatnpvopnlqnrrz.supabase.co').replace(/\/+$/,'');
const key='sb-'+new URL(host).hostname.split('.')[0]+'-auth-token';
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
test('账号隔离、双设备拉取、离线修改与冲突保护（模拟 API）',async({browser})=>{
 const expires=Math.floor(Date.now()/1000)+3600;
 const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:uid,exp:expires,role:'authenticated'})+'.mock';
 const session={access_token:token,refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,expires_at:expires,user:{id:uid,email:'test@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}};
 let row=null,deltaWrites=0,metadataReads=0,deltaReads=0,deltaMisses=0,patches=[],forceRace=false;
 test.setTimeout(180000);const contexts=[];
 async function device(){
  const ctx=await browser.newContext();contexts.push(ctx);
  await ctx.routeWebSocket("**/realtime/v1/websocket**",ws=>ws.close());
  await ctx.addInitScript(({key,session})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(session))},{key,session});
  await ctx.route(host+'/**',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.pathname==='/auth/v1/user')return route.fulfill({json:session.user});
   if(url.pathname.endsWith('/rpc/todo_read_task_deltas')){
    const {p_revision}=req.postDataJSON(),chain=patches.filter(p=>p.from>=p_revision);
    if(!row||!chain.length||chain[0].from!==p_revision||chain.at(-1).to!==row.revision){deltaMisses++;return route.fulfill({json:null})}
    deltaReads++;return route.fulfill({json:{revision:row.revision,updated_at:row.updated_at,patches:chain}});
   }
   if(url.pathname.endsWith('/rpc/todo_apply_task_delta')){
    const {p_revision,p_tasks}=req.postDataJSON();
    if(forceRace){forceRace=false;row={...row,revision:row.revision+1,state:{...row.state,tasks:row.state.tasks.map(t=>t.title==='设备 A 冲突内容'?{...t,title:'并发更新后的云端版本'}:t)},updated_at:new Date().toISOString()};patches=[];return route.fulfill({json:null})}
    if(!row||row.revision!==p_revision)return route.fulfill({json:null});
    const changes=new Map(p_tasks.map(t=>[t.id,t])),existing=new Set(row.state.tasks.map(t=>t.id));
    row={...row,revision:row.revision+1,state:{...row.state,tasks:[...row.state.tasks.map(t=>changes.get(t.id)||t),...p_tasks.filter(t=>!existing.has(t.id))]},updated_at:new Date().toISOString()};deltaWrites++;patches=[...patches,{from:p_revision,to:row.revision,tasks:p_tasks}].slice(-8);
    return route.fulfill({json:{revision:row.revision,updated_at:row.updated_at}});
   }
   if(!url.pathname.endsWith('/todo_workspaces'))return route.fulfill({status:404,json:{message:'mock route'}});
   if(req.method()==='GET'){if(url.searchParams.get('select')==='revision,updated_at'){metadataReads++;return route.fulfill({json:row?[{revision:row.revision,updated_at:row.updated_at}]:[]})}return route.fulfill({json:row?[row]:[]})}
   const body=req.postDataJSON();
   if(req.method()==='POST'){if(row)return route.fulfill({status:409,json:{code:'23505',message:'duplicate'}});row={...body,updated_at:new Date().toISOString()}}
   else if(req.method()==='PATCH'){if(forceRace){forceRace=false;row={...row,revision:row.revision+1,state:{...row.state,tasks:row.state.tasks.map(t=>t.title==='设备 A 冲突内容'?{...t,title:'并发更新后的云端版本'}:t)},updated_at:new Date().toISOString()};patches=[];return route.fulfill({status:406,json:{code:'PGRST116',details:'The result contains 0 rows',message:'Cannot coerce the result to a single JSON object'}})}if(!row||url.searchParams.get('revision')!=='eq.'+row.revision)return route.fulfill({status:406,json:{code:'PGRST116',details:'The result contains 0 rows',message:'Cannot coerce the result to a single JSON object'}});row={...row,...body,updated_at:new Date().toISOString()};patches=[]}
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
  await b.ctx.setOffline(false);await expect.poll(()=>row.state.tasks.some(t=>t.title==='设备 B 离线修改'),{timeout:20000}).toBe(true);
  expect(row.state.tasks.some(t=>t.title==='设备 A 在线修改')).toBe(true);expect(deltaWrites).toBeGreaterThan(0);expect(metadataReads).toBeGreaterThan(0);
  await expect(b.page.locator('.sync-footer')).toContainText('已同步',{timeout:12000});
  // Wait for A to receive the merged revision before creating a genuine conflict.
  await a.page.getByRole('button',{name:'设置',exact:true}).click();
  await a.page.getByRole('button',{name:'立即同步'}).click();
  await a.page.keyboard.press('Escape');
  await expect(a.page.locator('.task-body').filter({hasText:'设备 B 离线修改'})).toBeVisible({timeout:15000});
  await b.ctx.setOffline(true);
  await b.page.locator('.task-body').filter({hasText:'设备 B 离线修改'}).click();
  await b.page.getByRole('textbox',{name:'任务标题'}).fill('设备 B 冲突内容');
  await expect(b.page.locator('.sync-footer')).toContainText('离线');
  await a.page.locator('.task-body').filter({hasText:'设备 B 离线修改'}).click();
  await a.page.getByRole('textbox',{name:'任务标题'}).fill('设备 A 冲突内容');
  await expect.poll(()=>row.state.tasks.some(t=>t.title==='设备 A 冲突内容')).toBe(true);
  await b.ctx.setOffline(false);await expect(b.page.locator('.sync-footer')).toContainText('存在同步冲突',{timeout:12000});
  expect(row.state.tasks.some(t=>t.title==='设备 B 冲突内容')).toBe(false);
  await expect(b.page.locator('.task-body').filter({hasText:'设备 B 冲突内容'})).toBeVisible();
  await b.page.getByRole('button',{name:'设置',exact:true}).click();
  await b.page.getByText('比较本地与云端版本',{exact:true}).click();
  await expect(b.page.locator('.conflict-preview')).toContainText('设备 B 冲突内容');
  await expect(b.page.locator('.conflict-preview')).toContainText('设备 A 冲突内容');
  await b.page.getByText('同步日志（本机）',{exact:true}).click();
  await expect(b.page.locator('.sync-diagnostics').filter({hasText:'同步日志（本机）'})).toContainText('检测到冲突');
  forceRace=true;
  b.page.once('dialog',d=>d.accept());await b.page.getByRole('button',{name:'保留本地并上传'}).click();
  await expect(b.page.locator('.sync-footer')).toContainText('云端版本已变化，请重新确认',{timeout:12000});
  await expect(b.page.locator('.conflict-preview')).toContainText('并发更新后的云端版本');
  await expect(b.page.locator('.task-body').filter({hasText:'设备 B 冲突内容'})).toBeVisible();
  expect(row.state.tasks.some(t=>t.title==='设备 B 冲突内容')).toBe(false);
  b.page.once('dialog',d=>d.accept());await b.page.getByRole('button',{name:'使用云端版本'}).click();
  await expect(b.page.locator('.sync-footer')).toContainText('已同步',{timeout:12000});
  expect(await b.page.evaluate(uid=>JSON.parse(localStorage.getItem('todo-account:'+uid+':todo-conflict-backup')).tasks.some(t=>t.title==='设备 B 冲突内容'),uid)).toBe(true);
  await b.page.keyboard.press('Escape');
  await a.page.getByRole('button',{name:'设置',exact:true}).click();
  await a.page.getByRole('button',{name:'立即同步'}).click();await a.page.keyboard.press('Escape');
  await expect(a.page.locator('.task-body').filter({hasText:'并发更新后的云端版本'})).toBeVisible({timeout:15000});
  // A new conflict is resolved field by field rather than by whole-workspace replacement.
  await b.ctx.setOffline(true);
  await b.page.locator('.task-body').filter({hasText:'并发更新后的云端版本'}).click();
  await b.page.getByRole('textbox',{name:'任务标题'}).fill('本地字段选择');
  await b.page.getByRole('textbox',{name:'任务备注'}).fill('保留本地备注');
  await expect(b.page.locator('.sync-footer')).toContainText('离线');
  await a.page.getByRole('textbox',{name:'任务标题'}).fill('云端字段选择');
  await expect.poll(()=>row.state.tasks.some(t=>t.title==='云端字段选择')).toBe(true);
  await b.ctx.setOffline(false);await expect(b.page.locator('.sync-footer')).toContainText('存在同步冲突',{timeout:12000});
  await b.page.getByRole('button',{name:'设置',exact:true}).click();
  await b.page.getByText('按字段合并普通任务',{exact:true}).click();
  await b.page.locator('.field-conflict').getByRole('radio',{name:/云端/}).check();
  await b.page.getByRole('button',{name:'确认字段合并'}).click();
  await expect.poll(()=>row.state.tasks.some(t=>t.title==='云端字段选择'&&t.notes==='保留本地备注'),{timeout:20000}).toBe(true);
  expect(await b.page.evaluate(uid=>{const v=JSON.parse(localStorage.getItem('todo-account:'+uid+':todo-field-merge-backup'));return v.local.tasks.some(t=>t.title==='本地字段选择')&&v.remote.tasks.some(t=>t.title==='云端字段选择')},uid)).toBe(true);
  await b.page.keyboard.press('Escape');
  await b.page.getByRole('button',{name:'新建智能清单'}).click();
  await b.page.getByRole('textbox',{name:'智能清单名称'}).fill('同步智能清单');
  await chooseOption(b.page.getByRole('combobox',{name:'匹配方式'}),'any');
  await b.page.getByRole('button',{name:'保存智能清单'}).click();
  await expect.poll(()=>row.state.smartLists?.some(f=>f.name==='同步智能清单'&&f.mode==='any')).toBe(true);
  await a.page.getByRole('button',{name:'设置',exact:true}).click();await a.page.getByRole('button',{name:'立即同步'}).click();await a.page.keyboard.press('Escape');
  await expect(a.page.locator('.nav-row').filter({hasText:'同步智能清单'})).toBeVisible({timeout:15000});expect(deltaReads).toBeGreaterThan(0);expect(deltaMisses).toBeGreaterThan(0);
  // Series controls travel through the same revision-checked task delta protocol.
  await a.page.locator('[data-view-key=inbox]').click();await add(a.page,'同步重复系列');
  await a.page.locator('.task-body').filter({hasText:'同步重复系列'}).click();
  await a.page.getByRole('button',{name:'重复',exact:true}).click();
  await chooseOption(a.page.getByRole('combobox',{name:'重复规则'}),'daily');await a.page.getByRole('dialog',{name:'重复设置'}).getByRole('button',{name:'确定',exact:true}).click();
  await expect.poll(()=>row.state.tasks.find(t=>t.title==='同步重复系列')?.repeat).toBe('daily');
  await a.page.getByRole('button',{name:'查看重复系列'}).click();
  a.page.once('dialog',d=>d.accept());await a.page.getByRole('button',{name:'暂停系列'}).click();
  await expect.poll(()=>row.state.tasks.find(t=>t.title==='同步重复系列')?.seriesHold?.count).toBe(0);
  await a.page.keyboard.press('Escape');
  await b.page.getByRole('button',{name:'设置',exact:true}).click();await b.page.getByRole('button',{name:'立即同步'}).click();await b.page.keyboard.press('Escape');
  await b.page.locator('[data-view-key=inbox]').click();await b.page.locator('.task-body').filter({hasText:'同步重复系列'}).click();
  await b.page.getByRole('button',{name:'查看重复系列'}).click();
  await expect(b.page.getByRole('dialog',{name:'重复任务系列'})).toContainText('系列已暂停');
  await b.page.getByRole('button',{name:'恢复系列'}).click();
  await expect.poll(()=>row.state.tasks.find(t=>t.title==='同步重复系列')?.seriesHold).toBeNull();
  await b.page.keyboard.press('Escape');
  await a.page.getByRole('button',{name:'设置',exact:true}).click();await a.page.getByRole('button',{name:'立即同步'}).click();await a.page.keyboard.press('Escape');
  await a.page.getByRole('button',{name:'查看重复系列'}).click();await expect(a.page.getByRole('dialog',{name:'重复任务系列'})).toContainText('系列运行中');
  // Simulate an old client replacing the cloud snapshot without the pause marker.
  a.page.once('dialog',d=>d.accept());await a.page.getByRole('button',{name:'暂停系列'}).click();
  await expect.poll(()=>row.state.tasks.find(t=>t.title==='同步重复系列')?.seriesHold?.count).toBe(0);
  await expect(a.page.locator('.sync-footer')).toContainText('已同步',{timeout:15000});
  await a.page.keyboard.press('Escape');
  row={...row,revision:row.revision+1,state:{...row.state,tasks:row.state.tasks.map(t=>{if(t.title!=='同步重复系列')return t;const legacy={...t};delete legacy.seriesHold;return legacy})},updated_at:new Date().toISOString()};patches=[];
  await a.page.getByRole('button',{name:'设置',exact:true}).click();await a.page.getByRole('button',{name:'立即同步'}).click();
  await expect(a.page.locator('.sync-footer')).toContainText('存在同步冲突',{timeout:15000});
  expect(await a.page.evaluate(uid=>JSON.parse(localStorage.getItem('todo-account:'+uid+':todo-workbench-v1')).tasks.find(t=>t.title==='同步重复系列').seriesHold.count,uid)).toBe(0);
  a.page.once('dialog',d=>d.accept());await a.page.getByRole('button',{name:'保留本地并上传'}).click();
  await expect.poll(()=>row.state.tasks.find(t=>t.title==='同步重复系列')?.seriesHold?.count).toBe(0);
  await expect(a.page.locator('.sync-footer')).toContainText('已同步',{timeout:15000});
  await a.page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'任务与清单'}).click();
  const done=a.page.getByRole('switch',{name:'默认显示已完成任务'});if(await done.getAttribute('aria-checked')!=='true')await done.click();
  await a.page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'账号与同步'}).click();
  a.page.once('dialog',d=>d.accept());await a.page.getByRole('button',{name:'发布本机偏好'}).click();
  await expect.poll(()=>row.state.preferenceProfile?.value.showCompleted,{timeout:15000}).toBe(true);
  await b.page.getByRole('button',{name:'设置',exact:true}).click();await b.page.getByRole('button',{name:'立即同步'}).click();
  await expect(b.page.getByRole('button',{name:'应用共享偏好'})).toBeEnabled({timeout:15000});
  const localPrefs=page=>page.evaluate(uid=>JSON.parse(localStorage.getItem('todo-account:'+uid+':todo-view-preferences-v1')||'{}'),uid);
  expect((await localPrefs(b.page)).showCompleted||false).toBe(false);
  b.page.once('dialog',d=>d.accept());await b.page.getByRole('button',{name:'应用共享偏好'}).click();
  await expect.poll(async()=>(await localPrefs(b.page)).showCompleted).toBe(true);
  b.page.once('dialog',d=>d.accept());await b.page.getByRole('button',{name:'恢复本机偏好'}).click();
  await expect.poll(async()=>(await localPrefs(b.page)).showCompleted).toBe(false);
  await expect(a.page.locator('.sync-footer')).toContainText('已同步',{timeout:15000});
  const beforeProfile=row.state.preferenceProfile;
  const legacyState={...row.state};delete legacyState.preferenceProfile;
  row={...row,state:legacyState,revision:row.revision+1,updated_at:new Date().toISOString()};patches=[];
  await a.page.getByRole('button',{name:'立即同步'}).click();
  await expect(a.page.locator('.sync-footer')).toContainText('存在同步冲突',{timeout:15000});
  a.page.once('dialog',d=>d.accept());await a.page.getByRole('button',{name:'保留本地并上传'}).click();
  await expect.poll(()=>row.state.preferenceProfile,{timeout:15000}).toEqual(beforeProfile);

 }finally{await Promise.all(contexts.map(c=>c.close()))}
});
