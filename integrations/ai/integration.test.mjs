import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {localFixture,ownerA,ownerB} from './local-fixture.mjs';
import {normalizeExternalTasks} from '../../src/core/external-capture.js';
test('真实PG事务、REST认证/去重/并发/拒绝/回执及MCP stdio',async()=>{
 const f=await localFixture(),{api,row,pool}=f;
 try{
  const issue=async(owner,label,automatic)=>(await api(owner,'/v1/owner/tokens',{label,automatic})).body.token;
  const manual=await issue('qa-owner-a','manual',false),auto=await issue('qa-owner-a','auto',true),other=await issue('qa-owner-b','other',true);
  assert.match(manual,/^todo_[a-f0-9]{64}$/);assert.equal((await api('wrong','/v1/tasks',{title:'bad'},'x')).code,401);
  const initial=await row(ownerA);
  const input={title:'会议纪要',notes:'只作为文字',date:'2026-12-01',time:'09:00',priority:0,duration:45};
  const p=await api(manual,'/v1/tasks',input,'manual-1');assert.equal(p.code,202);assert.equal(p.body.status,'received');assert.deepEqual((await row(ownerA)).state,initial.state);
  assert.equal((await api(manual,'/v1/tasks',input,'manual-1')).body.id,p.body.id);
  assert.equal((await api(manual,'/v1/tasks',{title:'冲突'},'manual-1')).code,409);
  assert.equal((await api(other,'/v1/requests/'+p.body.id)).code,404);
  assert.equal((await api(auto,'/v1/requests/'+p.body.id)).code,404);
  assert.equal((await api('qa-owner-b','/v1/owner/requests/'+p.body.id+'/approve',{})).code,404);
  assert.equal((await api(manual,'/v1/owner/requests')).code,401);
  const approve=await Promise.all(Array.from({length:4},()=>api('qa-owner-a','/v1/owner/requests/'+p.body.id+'/approve',{})));
  assert(approve.every(x=>x.code===200&&x.body.status==='saved'&&x.body.task_ids[0]===p.body.id+':1'));
  let a=await row(ownerA);assert.equal(a.state.tasks.length,1);assert.equal(a.state.tasks[0].duration,45);assert.equal(a.state.tasks[0].priority,0);assert.equal(a.state.tasks[0].activity[0].source,'device');assert.equal(a.state.tasks[0].activity[0].operation,p.body.id);
  assert.deepEqual((await row(ownerB)).state.tasks,[]);
  // Force a stale commit snapshot against a regular workspace revision update.
  const stale=await api(manual,'/v1/tasks',{title:'CAS保护'},'stale');
  const snap=await f.rpc('workspace',ownerA,null,{id:stale.body.id});
  const {buildExternalCapture}=await import('../../src/core/external-capture.js');
  const candidate=buildExternalCapture(snap.state,snap.request);
  await pool.query("update public.todo_workspaces set state=jsonb_set(state,'{theme}','\"dark\"'),revision=revision+1 where user_id=$1",[ownerA]);
  const conflict=await f.rpc('commit',ownerA,null,{id:stale.body.id,revision:snap.revision,tasks:candidate});
  assert.equal(conflict.retry,true);assert.equal((await row(ownerA)).state.tasks.length,1);
  assert.equal((await api(manual,'/v1/requests/'+stale.body.id)).body.status,'received');
  await api('qa-owner-a','/v1/owner/requests/'+stale.body.id+'/reject',{});
  const batch=[{title:'批量1'},{title:'批量2',deadline:'2026-12-03'}];
  const both=await Promise.all([api(auto,'/v1/tasks/batch',batch,'same-batch'),api(auto,'/v1/tasks/batch',batch,'same-batch'),api(auto,'/v1/tasks',{title:'并发新任务'},'different')]);
  assert(both.every(x=>x.body.status==='saved'));assert.equal(both[0].body.id,both[1].body.id);a=await row(ownerA);assert.equal(a.state.tasks.length,4);assert.equal(Number(a.revision),5);assert.equal(a.state.theme,"dark");
  const pending=await api(manual,'/v1/tasks',{title:'拒绝'},'reject');assert.equal((await api('qa-owner-a','/v1/owner/requests/'+pending.body.id+'/reject',{})).body.status,'rejected');assert.equal((await api('qa-owner-a','/v1/owner/requests/'+pending.body.id+'/approve',{})).body.status,'rejected');
  const missing=await api(auto,'/v1/tasks',{title:'未知清单',listId:'missing'},'missing');assert.equal(missing.code,202);assert.equal(missing.body.status,'received');assert.equal((await row(ownerA)).state.tasks.length,4);
  const invalidBatch=await api(auto,'/v1/tasks/batch',[{title:'不能部分写入'},{title:'缺失清单',listId:'missing'}],'invalid-batch');
  assert.equal(invalidBatch.code,202);assert.equal((await row(ownerA)).state.tasks.length,4);
  for(const invalid of [{title:'bad',status:'completed'},{title:'bad',date:'2026-02-30'},{title:'bad',time:'09:00'},{title:'bad',priority:9}])assert.equal((await api(auto,'/v1/tasks',invalid,'invalid')).code,400);
  assert.equal((await api(auto,'/v1/tasks',{title:'no key'})).code,400);
  const client=new Client({name:'todo-local-qa',version:'1.0.0'});const transport=new StdioClientTransport({command:process.execPath,args:[new URL('./mcp.mjs',import.meta.url).pathname],env:{TODO_API_URL:f.base,TODO_API_TOKEN:auto}});await client.connect(transport);
  try{const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name).sort(),['create_task','create_tasks','get_request_status']);
   const result=await client.callTool({name:'create_task',arguments:{request_key:'mcp-1',task:{title:'MCP 实际录入'}}});assert.equal(result.isError,undefined);const rec=JSON.parse(result.content[0].text);assert.equal(rec.status,'saved');
   const status=await client.callTool({name:'get_request_status',arguments:{id:rec.id}});assert.equal(JSON.parse(status.content[0].text).status,'saved');
   const multi=await client.callTool({name:'create_tasks',arguments:{request_key:'mcp-batch',tasks:[{title:'MCP batch'}]}});assert.equal(JSON.parse(multi.content[0].text).status,'saved');
  }finally{await client.close()}
  const tokens=(await api('qa-owner-a','/v1/owner/tokens')).body;assert(!JSON.stringify(tokens).includes(auto));assert(!JSON.stringify(tokens).includes('token_hash'));
  const revoked=tokens.find(t=>t.label==='auto');await api('qa-owner-a','/v1/owner/tokens/'+revoked.id+'/revoke',{});assert.equal((await api(auto,'/v1/tasks',{title:'撤销后'},'revoked')).code,401);
  const c=await pool.connect();try{await c.query('begin');await c.query('set local role authenticated');await assert.rejects(c.query('select * from public.todo_external_tokens'),{code:'42501'});await c.query('rollback');await c.query('begin');await c.query('set local role authenticated');await assert.rejects(c.query("select public.todo_external_gateway('tokens',null,null,'{}')"),{code:'42501'});await c.query('rollback')}finally{c.release()}
  assert.equal((await row(ownerA)).state.tasks.length,6);assert.equal((await row(ownerB)).state.tasks.length,0);
  console.log('PASS actual PostgreSQL atomic receipts, six tasks, account isolation, scoped tokens, MCP 3 tools');
 }finally{await f.close()}
});
test('结构化契约不接受未知字段、隐式日期、空标题',()=>{
 for(const bad of [{title:''},{title:'x',date:'明天'},{title:'x',time:'09:00'},{title:'x',id:'foreign'}])assert.throws(()=>normalizeExternalTasks([bad]));
 assert.deepEqual(normalizeExternalTasks([{title:' a ',priority:0}]),[{title:'a',priority:0}]);
});
