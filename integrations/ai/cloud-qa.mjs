// Real-cloud test runner: user invokes locally in a TTY. No production or model credentials.
// No service-role key, request stubs, tracing, session exports, or stored passwords.
import assert from 'node:assert/strict';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {chromium,expect} from '@playwright/test';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {initialState,STORAGE_KEY} from '../../src/core/domain.js';

const ref='lwwmhwefdwfuprphmybn',url='https://'+ref+'.supabase.co',preview='http://127.0.0.1:4318',prefix='[AI-QA] ';
const key=process.env.TODO_QA_PUBLISHABLE_KEY,base=url+'/functions/v1/todo-external';
assert.equal(process.env.TODO_QA_CONFIRM_PROJECT,ref,'Explicit QA project confirmation required');
assert(key?.startsWith('sb_publishable_'),'QA public key required');
const clients=[],contexts=[],issued=[];let browser,mc,stage='preflight',report;
const authKey='sb-'+ref+'-auth-token';
const ok=r=>{if(r.error)throw Error('Supabase request failed');return r.data};
async function api(token,path,body,requestKey){
 const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json',...(requestKey?{'Idempotency-Key':requestKey}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
 return {code:res.status,result:await res.json()};
}
async function verifyPreview(){
 const res=await fetch(preview+'/src/cloud-config.js',{signal:AbortSignal.timeout(5000)});
 assert(res.ok);const s=await res.text();
 // Vite replaces import.meta.env with the exact QA environment. Do not log the module.
 const match=s.match(/^import\.meta\.env\s*=\s*(\{[^\n]*?\});/);assert(match,"Preview configuration missing");const env=JSON.parse(match[1]);assert(env.VITE_SUPABASE_URL===url&&env.VITE_SUPABASE_PUBLISHABLE_KEY===key&&env.VITE_TODO_EXTERNAL_API==="1","Preview is not bound to QA");
 assert.equal((await api('invalid-jwt','/v1/owner/tokens')).code,401);
}
async function askUsers(){
 assert(process.stdin.isTTY&&process.stdout.isTTY,'Use a local terminal; never send passwords through chat');
 let muted=false;
 const output=new Writable({write(chunk,enc,cb){if(!muted)process.stdout.write(chunk,enc);cb()}});
 output.isTTY=true;output.columns=process.stdout.columns||80;
 const rl=createInterface({input:process.stdin,output,terminal:true});
 try{
  const users=[];
  for(const n of ['A','B']){
   const email=(await rl.question('测试账号 '+n+' 邮箱：')).trim();
   process.stdout.write('测试账号 '+n+' 密码（不显示）：');muted=true;
   let password;try{password=await rl.question('')}finally{muted=false;process.stdout.write('\n')}
   assert(email&&password);users.push({email,password});
  }
  assert.notEqual(users[0].email,users[1].email);
  return users;
 }finally{rl.close()}
}
async function connect(u){
 const c=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {session}=ok(await c.auth.signInWithPassword(u));assert(session?.access_token);
 const {user}=ok(await c.auth.getUser());assert.equal(user.id,session.user.id);
 const d={c,session,uid:user.id};clients.push(d);return d;
}
async function workspace(d){
 return ok(await d.c.from('todo_workspaces').select('user_id,state,revision').eq('user_id',d.uid).maybeSingle());
}
async function ensureQaWorkspace(d){
 const current=await workspace(d);
 if(current){
  assert(Array.isArray(current.state?.tasks)&&current.state.tasks.every(t=>typeof t.title==='string'&&t.title.startsWith(prefix)),'Refusing non-QA task data');
 }else ok(await d.c.from('todo_workspaces').insert({user_id:d.uid,state:initialState(),revision:1}));
 return workspace(d);
}
async function issue(d,label,automatic){
 const r=await api(d.session.access_token,'/v1/owner/tokens',{label,automatic});
 assert.equal(r.code,201);assert.match(r.result.token,/^todo_[a-f0-9]{64}$/);issued.push([d,r.result.id]);return r.result.token;
}
async function device(d){
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(ctx);
 // Permit only local QA UI and the independent test project; no response stubs.
 await ctx.route('**/*',route=>{const origin=new URL(route.request().url()).origin;return origin===preview||origin===url?route.continue():route.abort()});
 await ctx.routeWebSocket('**/*',ws=>{if(new URL(ws.url()).hostname===ref+'.supabase.co')ws.connectToServer();else ws.close()});
 await ctx.addInitScript(({key,session})=>{if(!sessionStorage.getItem('qa-auth-initialized')){localStorage.setItem(key,JSON.stringify(session));sessionStorage.setItem('qa-auth-initialized','1')}},{key:authKey,session:d.session});
 const page=await ctx.newPage();await page.goto(preview);
 assert(await page.evaluate(async({url,key})=>{const config=await import('/src/cloud-config.js');return config.CLOUD_URL===url&&config.CLOUD_KEY===key},{url,key}));
 await expect(page.getByRole('textbox',{name:'新任务名称'})).toBeVisible({timeout:20000});
 await expect(page.locator('.sync-footer')).toContainText('已同步',{timeout:30000});
 return page;
}
async function persisted(page,d,title){
 await expect.poll(()=>page.evaluate(({uid,key,title})=>JSON.parse(localStorage.getItem('todo-account:'+uid+':'+key)||'{}').tasks?.filter(t=>t.title===title).length||0,{uid:d.uid,key:STORAGE_KEY,title}),{timeout:30000}).toBe(1);
}
async function pull(page){
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'立即同步',exact:true}).click();
 await page.keyboard.press('Escape');
}
async function main(){
 await verifyPreview();
 if(process.argv.includes('--preflight')){console.log('PASS QA preview binding + live unauthorized HTTP 401');return}
 const users=await askUsers();stage='真实Auth';
 let a,b,a2;
 try{a=await connect(users[0]);b=await connect(users[1]);a2=await connect(users[0])}finally{for(const u of users)u.password=''}
 assert.notEqual(a.uid,b.uid);assert.equal(a.uid,a2.uid);console.log('PASS 真实密码登录、getUser 与同账号独立会话');
 stage='RLS';
 const before=await ensureQaWorkspace(a);await ensureQaWorkspace(b);
 assert.deepEqual(ok(await b.c.from('todo_workspaces').select('user_id').eq('user_id',a.uid)),[]);
 assert((await a.c.from('todo_external_tokens').select('id')).error);
 assert((await a.c.rpc('todo_external_gateway',{p_action:'tokens',p_owner:a.uid,p_hash:null,p_payload:{}})).error);
 console.log('PASS 真实登录角色 RLS、内部表及 RPC 拒绝');
 stage='真实双浏览器';browser=await chromium.launch({channel:'msedge',headless:true});
 const pa=await device(a),pb=await device(a2);
 const stamp=randomUUID().slice(0,8),title=prefix+stamp+' 审批',manual=await issue(a,'AI-QA manual '+stamp,false),auto=await issue(a,'AI-QA MCP '+stamp,true),other=await issue(b,'AI-QA other '+stamp,false);
 stage='待确认及实际审批';
 const pending=await api(manual,'/v1/tasks',{title},stamp+'-manual');
 assert.equal(pending.code,202);assert.equal(pending.result.status,'received');
 assert.equal((await workspace(a)).state.tasks.length,before.state.tasks.length);
 assert.equal((await api(other,'/v1/requests/'+pending.result.id)).code,404);
 assert.equal((await api(b.session.access_token,'/v1/owner/requests/'+pending.result.id+'/approve',{})).code,404);
 await pa.getByRole('button',{name:'设置',exact:true}).click();
 await pa.getByRole('button',{name:'管理外部接入'}).click();
 const entry=pa.locator('.external-request').filter({hasText:title});await expect(entry).toBeVisible();
 await entry.getByRole('button',{name:'确认创建',exact:true}).click();
 await expect(pa.getByText('已保存到云端，等待本机同步',{exact:true})).toBeVisible();
 await pa.keyboard.press('Escape');await pull(pb);
 await persisted(pa,a,title);await persisted(pb,a2,title);
 const receipt=await api(manual,'/v1/requests/'+pending.result.id);assert.equal(receipt.result.status,'saved');
 assert.equal((await api(manual,'/v1/tasks',{title},stamp+'-manual')).result.id,pending.result.id);
 assert.equal((await api(manual,'/v1/tasks',{title:title+' conflict'},stamp+'-manual')).code,409);
 console.log('PASS 待确认、真实UI审批、回执、幂等及双浏览器本地持久化');
 stage='真实MCP到云端';
 mc=new Client({name:'todo-cloud-qa',version:'1'});
 await mc.connect(new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./mcp.mjs',import.meta.url))],env:{TODO_API_URL:base,TODO_API_TOKEN:auto,TODO_API_PUBLISHABLE_KEY:key}}));
 const tools=await mc.listTools();assert.equal(tools.tools.length,3);
 const call=async(name,args)=>{const r=await mc.callTool({name,arguments:args});assert(!r.isError);const v=JSON.parse(r.content[0].text);assert.equal(v.status,'saved');return v};
 const titles=['单条','批量甲','批量乙'].map(t=>prefix+stamp+' '+t);
 const one=await call('create_task',{request_key:stamp+'-single',task:{title:titles[0]}});
 const batch=await call('create_tasks',{request_key:stamp+'-batch',tasks:titles.slice(1).map(title=>({title}))});
 assert.equal(batch.task_ids.length,2);
 assert.equal((await call('get_request_status',{id:one.id})).id,one.id);
 await pull(pa);await pull(pb);
 for(const t of titles){await persisted(pa,a,t);await persisted(pb,a2,t)}
 await pb.reload();await persisted(pb,a2,titles[2]);
 const after=await workspace(a),second=await workspace(a2);assert.deepEqual(after.state,second.state);
 assert.equal(after.state.tasks.length,before.state.tasks.length+4);
 assert(!(await workspace(b)).state.tasks.some(t=>t.title.includes(stamp)));
 const autoId=issued.find(([d,id])=>d===a&&id!==issued[0][1])[1];
 assert.equal((await api(a.session.access_token,'/v1/owner/tokens/'+autoId+'/revoke',{})).code,200);
 assert.equal((await api(auto,'/v1/tasks',{title:prefix+' revoked'},stamp+'-revoked')).code,401);
 report={project:ref,completedAt:new Date().toISOString(),auth:'real',rls:'real',http:'real',browserContexts:2,manualApproval:1,mcpTasks:3,revision:after.revision,receipt:'saved',reload:'passed',modelSessions:'not tested',chatgptOAuth:'not tested'};
 console.log('PASS 真实MCP协议→云端单条/批量、双浏览器回读、刷新、撤销');
}
try{await main()}catch{console.error('FAIL at '+stage+'；未输出凭据或原始响应。请检查测试账号、QA预览、网络及云端状态。');process.exitCode=1}
finally{
 if(mc)try{await mc.close()}catch{}
 for(const [d,id] of issued){try{const r=await api(d.session.access_token,'/v1/owner/tokens/'+id+'/revoke',{});if(r.code!==200)throw Error()}catch{console.error('QA令牌撤销未确认，请在QA设置中撤销');process.exitCode=1}}
 for(const ctx of contexts)await ctx.close();if(browser)await browser.close();
 for(const d of clients){try{const r=await d.c.auth.signOut({scope:'local'});if(r.error)throw Error()}catch{console.error('QA会话退出未确认');process.exitCode=1}}
 if(report&&!process.exitCode){if(process.env.TODO_QA_REPORT)await writeFile(process.env.TODO_QA_REPORT,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report))}
}
