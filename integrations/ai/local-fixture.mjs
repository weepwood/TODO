// Isolated disposable PostgreSQL + real HTTP. Never reads production config or credentials.
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import pg from 'pg';
import {gateway} from './gateway.mjs';
import {initialState} from '../../src/core/domain.js';
const root=new URL('../../',import.meta.url);
export const ownerA='00000000-0000-4000-8000-0000000000a1',ownerB='00000000-0000-4000-8000-0000000000b2';
export async function localFixture(){
 const dir=await mkdtemp(join(tmpdir(),'todo-ai-pg-')),data=join(dir,'db');
 const run=(bin,args)=>execFileSync(bin,args,{stdio:'pipe',timeout:30000});
 let pool,server,started=false;
 const close=async()=>{if(server)await new Promise(r=>server.close(r));if(pool)await pool.end();if(started)run('pg_ctl',['-D',data,'-m','fast','-w','stop']);await rm(dir,{recursive:true,force:true})};
 try{
  run('initdb',['-D',data,'-A','trust','-U','todo_qa','--no-locale','-E','UTF8']);
  run('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',"-c listen_addresses='' -k '"+dir+"' -p 55432",'-w','start']);started=true;
  pool=new pg.Pool({host:dir,port:55432,user:'todo_qa',database:'postgres',max:8});
  await pool.query(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to anon,authenticated,service_role;
  create publication supabase_realtime;`);
  for(const name of ['20261125025403_todo_workspace_sync.sql','20261125032539_todo_task_delta.sql','20261125034756_todo_read_task_deltas.sql'])await pool.query(await readFile(new URL('supabase/migrations/'+name,root),'utf8'));
  await pool.query(await readFile(new URL('docs/ai-integration/schema.sql',root),'utf8'));
  await pool.query('insert into auth.users values($1),($2)',[ownerA,ownerB]);
  for(const uid of [ownerA,ownerB])await pool.query('insert into public.todo_workspaces(user_id,state) values($1,$2)',[uid,initialState()]);
  const rpc=async(action,owner,hash,payload)=>{
   const c=await pool.connect();try{await c.query('begin');await c.query('set local role service_role');const {rows}=await c.query('select public.todo_external_gateway($1,$2,$3,$4) as result',[action,owner,hash,payload]);await c.query('commit');return rows[0].result}catch(e){await c.query('rollback');throw e}finally{c.release()}
  };
  const secrets=new Map([['qa-owner-a',ownerA],['qa-owner-b',ownerB]]);
  const handle=gateway({rpc,authenticateOwner:async token=>secrets.get(token)??null});
  server=createServer(async(req,res)=>{try{const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})});const result=await handle(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()))}catch{res.writeHead(500);res.end()}});await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});
  const base='http://127.0.0.1:'+server.address().port;
  const api=async(token,path,body,key)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {code:r.status,body:await r.json()}};
  const row=async uid=>(await pool.query('select * from public.todo_workspaces where user_id=$1',[uid])).rows[0];
  return {base,pool,rpc,api,row,close,secrets};
 }catch(e){await close();throw e}
}
