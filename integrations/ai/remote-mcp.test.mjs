import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createRemoteMcp} from './remote-mcp.mjs';
import {localFixture,ownerA,ownerB} from './local-fixture.mjs';
const listen=s=>new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r)});
const close=s=>new Promise(r=>s.close(r));
test('真实HTTP MCP、资源发现、RFC7662模拟授权、最小scope与账号绑定',async()=>{
 const f=await localFixture();let remote,as;
 try{
  const issue=async(owner,label)=>(await f.api(owner,'/v1/owner/tokens',{label,automatic:true})).body.token;
  const a=await issue('qa-owner-a','MCP A'),b=await issue('qa-owner-b','MCP B');
  // Real HTTP introspection transport, synthetic authorization server claims.
  const records=new Map();let calls=0;
  as=createServer(async(req,res)=>{
   let body='';for await(const c of req)body+=c;
   assert.equal(req.headers.authorization,'Basic '+Buffer.from('qa-introspect:qa-secret').toString('base64'));
   const token=new URLSearchParams(body).get('token');calls++;
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(records.get(token)||{active:false}));
  });await listen(as);
  const issuer='http://127.0.0.1:'+as.address().port;
  // Reserve a loopback port without exposing a public listener.
  const reservation=createServer();await listen(reservation);const port=reservation.address().port;await close(reservation);
  const resource='http://127.0.0.1:'+port+'/mcp';
  const valid={active:true,iss:issuer,aud:[resource],sub:'qa-a',client_id:'qa-client-a',exp:Math.floor(Date.now()/1000)+600,scope:'tasks:create receipts:read'};
  records.set('qa-token-a',valid);records.set('qa-token-b',{...valid,sub:'qa-b',client_id:'qa-client-b'});
  records.set('qa-read',{...valid,scope:'receipts:read'});
  records.set('qa-wrong-aud',{...valid,aud:['https://another-resource.invalid']});
  records.set('qa-wrong-issuer',{...valid,iss:'https://unknown.invalid'});
  records.set('qa-expired',{...valid,exp:1});
  records.set('qa-unbound',{...valid,client_id:'other-client'});
  remote=createRemoteMcp({resource,issuer,introspection:issuer+'/introspect',clientId:'qa-introspect',clientSecret:'qa-secret',bindings:[{sub:'qa-a',client_id:'qa-client-a',todo_token:a},{sub:'qa-b',client_id:'qa-client-b',todo_token:b}],apiBase:f.base,allowLoopback:true});
  await new Promise((r,j)=>{remote.once('error',j);remote.listen(port,'127.0.0.1',r)});
  const metadata=await fetch(new URL('/.well-known/oauth-protected-resource/mcp',resource)).then(r=>r.json());assert.equal(metadata.resource,resource);assert.deepEqual(metadata.authorization_servers,[issuer]);
  const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'qa',version:'1'}}};
  const post=(token,headers={})=>fetch(resource,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(token?{Authorization:'Bearer '+token}:{}),...headers},body:JSON.stringify(init)});
  const unauthorized=await post();assert.equal(unauthorized.status,401);assert.match(unauthorized.headers.get('www-authenticate'),/resource_metadata=/);
  for(const token of ['qa-wrong-aud','qa-wrong-issuer','qa-expired','qa-unbound','qa-unknown'])assert.equal((await post(token)).status,401);
  assert.equal((await post('qa-token-a',{Origin:'https://evil.invalid'})).status,403);
  const client=async token=>{const c=new Client({name:'remote-qa',version:'1'});await c.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+token}}}));return c};
  const ca=await client('qa-token-a'),cb=await client('qa-token-b'),cr=await client('qa-read');
  try{
   const tools=await ca.listTools();assert.equal(tools.tools.length,3);assert.equal(tools.tools.find(t=>t.name==='create_task')._meta.securitySchemes[0].scopes[0],'tasks:create');
   const create=async(c,key,title)=>c.callTool({name:'create_task',arguments:{request_key:key,task:{title}}});
   const x=JSON.parse((await create(ca,'http-a','远程 A')).content[0].text);
   assert.equal(x.status,'saved');
   assert.equal(JSON.parse((await create(ca,'http-a','远程 A')).content[0].text).id,x.id);
   assert.equal(JSON.parse((await create(cb,'http-b','远程 B')).content[0].text).status,'saved');
   const deny=await create(cr,'read-deny','禁止写入');assert.equal(deny.isError,true);assert(deny._meta['mcp/www_authenticate'][0].includes('insufficient_scope'));
   const cross=await cb.callTool({name:'get_request_status',arguments:{id:x.id}});assert.equal(cross.isError,true);
   const read=await cr.callTool({name:'get_request_status',arguments:{id:x.id}});assert.equal(JSON.parse(read.content[0].text).status,'saved');
   records.set('qa-token-a',{active:false});
   assert.equal((await post('qa-token-a')).status,401);
   assert.equal((await f.row(ownerA)).state.tasks.length,1);assert.equal((await f.row(ownerB)).state.tasks.length,1);assert(calls>10);
  }finally{await Promise.all([ca.close(),cb.close(),cr.close()])}
  console.log('PASS real Streamable HTTP + PG; synthetic AS, 2 isolated owners, discovery, scope, revoked token');
 }finally{if(remote)await close(remote);if(as)await close(as);await f.close()}
});
