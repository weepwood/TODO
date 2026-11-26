import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {localFixture,ownerA,ownerB} from './local-fixture.mjs';
const bundle=process.env.TODO_QA_EDGE_BUNDLE;
if(!bundle)throw Error('Set TODO_QA_EDGE_BUNDLE to the built file');
const f=await localFixture();let proxy,child;
const listen=s=>new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r)});
const close=s=>new Promise(r=>s.close(r));
try{
 // Supabase Auth/PostgREST facade; SQL execution and Edge runtime are real.
 proxy=createServer(async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body))};
  try{
   if(req.url==='/auth/v1/user'){
    const uid=f.secrets.get(req.headers.authorization?.slice(7));return uid?send(200,{id:uid,aud:'authenticated',role:'authenticated'}):send(401,{msg:'invalid test authorization'});
   }
   if(req.url==='/rest/v1/rpc/todo_external_gateway'&&req.headers.authorization==='Bearer synthetic-edge-service'){
    let raw='';for await(const c of req)raw+=c;const p=JSON.parse(raw);
    return send(200,await f.rpc(p.p_action,p.p_owner,p.p_hash,p.p_payload));
   }
   send(403,{message:'unexpected synthetic transport'});
  }catch{send(500,{message:'fixture failure'})}
 });await listen(proxy);
 const reservation=createServer();await listen(reservation);const port=reservation.address().port;await close(reservation);
 const upstream='http://127.0.0.1:'+proxy.address().port,base='http://127.0.0.1:'+port+'/functions/v1/todo-external';
 child=spawn('deno',['run','--allow-env','--allow-net=127.0.0.1:'+port+',127.0.0.1:'+proxy.address().port,bundle],{env:{PATH:process.env.PATH,HOME:process.env.HOME,SUPABASE_URL:upstream,SUPABASE_SERVICE_ROLE_KEY:'synthetic-edge-service',TODO_EDGE_QA_PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
 const call=async(token,path,body,key)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}};
 for(let i=0;i<80;i++){try{const r=await call('invalid','/v1/owner/tokens');if(r.status===401)break}catch{}if(child.exitCode!==null||i===79)throw Error('Deno runtime not ready: '+output.slice(-800));await new Promise(r=>setTimeout(r,100))}
 const issued=await call('qa-owner-a','/v1/owner/tokens',{label:'Deno bundled edge',automatic:true});assert.equal(issued.status,201);
 const token=issued.data.token;
 const x=await call(token,'/v1/tasks',{title:'Deno 实际入口'},'edge-qa');assert.equal(x.status,200);assert.equal(x.data.status,'saved');
 assert.equal((await call(token,'/v1/tasks',{title:'Deno 实际入口'},'edge-qa')).data.id,x.data.id);
 assert.equal((await call('qa-owner-b','/v1/owner/requests/'+x.data.id+'/approve',{})).status,404);
 assert.equal((await f.row(ownerA)).state.tasks.length,1);assert.equal((await f.row(ownerB)).state.tasks.length,0);
 console.log('PASS bundled Deno Edge runtime over HTTP, actual PG, synthetic Auth/PostgREST transport');
}finally{if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r))}if(proxy)await close(proxy);await f.close()}
