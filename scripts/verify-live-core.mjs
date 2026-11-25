// Manual release gate. No credentials, tokens or workspace contents are logged.
import assert from 'node:assert/strict';
import {initialState,newTask} from '../src/domain.js';
import {canonical} from '../src/cloud-core.js';
// Injectable adapter enables offline tests of the acceptance procedure itself.
// Only the CLI below this module can select the actual production endpoint.
export async function verifyLive({url,key,createClient,fetch:fetchImpl=globalThis.fetch,live=false,write=false,env={},logLine=console.log,errorLine=console.error,timeout=15000}){
const table='todo_workspaces',empty=initialState(),clients=[];
let stage='public preflight',a,b,channel,uid,expected=null,fixture=null,cleanupFailed=false,failed=false;
const check=(res)=>{if(res.error)throw Object.assign(Error('API request rejected'),{code:res.error.code||res.error.status});return res.data};
const signal=()=>AbortSignal.timeout(timeout);
const log=s=>logLine('PASS '+s);
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
function client(storage=memory(),storageKey='todo-qa-'+crypto.randomUUID()){const c=createClient(url,key,{auth:{storage,autoRefreshToken:false,persistSession:true,detectSessionInUrl:false,storageKey},global:{fetch:(input,init)=>fetchImpl(input,{...init,signal:init?.signal||signal()})}});clients.push(c);return c}
const getRow=async c=>check(await c.from(table).select('state,revision').eq('user_id',uid).abortSignal(signal()).maybeSingle());
const patch=async(c,revision,state)=>check(await c.from(table).update({state,revision:revision+1}).eq('user_id',uid).eq('revision',revision).select('revision').abortSignal(signal()).maybeSingle());
async function preflight(){
 const headers={apikey:key};
 const auth=await fetchImpl(url+'/auth/v1/settings',{headers,signal:signal()});assert.equal(auth.status,200);
 const settings=await auth.json();assert.equal(settings.external?.email,true);assert.equal(settings.disable_signup,false);assert.equal(settings.mailer_autoconfirm,false);log('email signup enabled; confirmation required');
 const anon=await fetchImpl(url+'/rest/v1/todo_workspaces?select=revision&limit=1',{headers,signal:signal()});assert([401,403].includes(anon.status));log('anonymous workspace read denied');
 for(const [name,body] of [['todo_read_task_deltas',{p_revision:1}],['todo_apply_task_delta',{p_revision:1,p_tasks:[]}]]){
  const r=await fetchImpl(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal()});
  assert([401,403].includes(r.status));log('anonymous '+name+' denied');
 }
}
try{
 await preflight();
 if(write&&!live)throw Error('--write requires --live');
 if(!live){logLine('PUBLIC_PREFLIGHT_PASS; authenticated gates NOT RUN');}
 else {
  stage='dedicated test account required';
  assert(env.TODO_QA_EMAIL&&env.TODO_QA_PASSWORD,'Set dedicated QA credentials locally');
  assert(!write||env.TODO_QA_ALLOW_WRITE==='YES','Explicit write opt-in required');
  const credentials={email:env.TODO_QA_EMAIL,password:env.TODO_QA_PASSWORD};
  stage='independent authenticated sessions';
  const saved=memory(),storageKey='todo-qa-'+crypto.randomUUID();a=client(saved,storageKey);b=client();
  const sa=check(await a.auth.signInWithPassword(credentials)),sb=check(await b.auth.signInWithPassword(credentials));
  uid=sa.user.id;assert.equal(sb.user.id,uid);
  assert(sa.user.email_confirmed_at&&sb.user.email_confirmed_at);log('two independent confirmed sessions');
  stage='session recovery';
  const recovered=client(saved,storageKey);assert.equal(check(await recovered.auth.getSession()).session?.user.id,uid);a=recovered;log('session restored from isolated memory storage');
  stage='session refresh';
  assert.equal(check(await a.auth.refreshSession()).user.id,uid);
  assert.equal(check(await a.auth.getUser()).user.id,uid);log('authenticated refresh and server identity');
  stage='owned workspace access';
  const original=await getRow(b);
  if(!write){log('authenticated owned-row read; realtime write/event gate NOT RUN');}
  else{
   stage='empty workspace safety gate';
   assert(!original||canonical(original.state)===canonical(empty),'Refusing to modify nonempty or customized workspace');
   // Do not overwrite or delete a preexisting workspace. If absent, initialize an empty QA row.
   const base=original||check(await b.from(table).insert({user_id:uid,state:empty,revision:1}).select('state,revision').abortSignal(signal()).single());
   assert.equal(canonical(base.state),canonical(empty));
   stage='realtime subscription';
   let receive;
   const event=new Promise(resolve=>receive=resolve);
   const nextRevision=base.revision+1;
   channel=a.channel('todo-qa-'+crypto.randomUUID()).on('postgres_changes',{event:'UPDATE',schema:'public',table,filter:'user_id=eq.'+uid},payload=>{if(Number(payload.new?.revision)===nextRevision)receive(true)});
   await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Realtime subscription timeout')),timeout);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(t);resolve()}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(t);reject(Error('Realtime subscription unavailable'))}})});
   log('authenticated realtime subscription');
   stage='CAS write and realtime delivery';
   fixture={...empty,tasks:[newTask('TODO RC1 QA synthetic task')]};expected=nextRevision;
   const result=await patch(b,base.revision,fixture);assert.equal(result?.revision,expected);
   let timer;try{await Promise.race([event,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Realtime event timeout')),timeout)})]);}finally{clearTimeout(timer)}
   assert.equal(canonical((await getRow(a)).state),canonical(fixture));log('cross-session realtime update and REST read');
   stage='stale revision protection';assert.equal(await patch(b,base.revision,empty),null);log('stale CAS write rejected');
   stage='cleanup';assert.equal((await patch(b,expected,empty))?.revision,expected+1);expected=null;
   assert.equal(canonical((await getRow(a)).state),canonical(empty));log('QA workspace restored to empty');
  }
  stage='independent signout';check(await a.auth.signOut({scope:'local'}));assert.equal(check(await b.auth.refreshSession()).user.id,uid);log('local signout preserves other session');
  // Final success is emitted only after teardown has succeeded.
 }
}catch(e){errorLine('FAIL '+stage+(e.code?' ['+String(e.code).replace(/[^a-zA-Z0-9_-]/g,'')+']':''));failed=true}
finally{
 if(expected!==null&&b){
  try{const row=await getRow(b);if(row?.revision===expected&&canonical(row.state)===canonical(fixture)){assert.equal((await patch(b,expected,empty))?.revision,expected+1);log('QA fixture recovered')}
   else if(!row||canonical(row.state)!==canonical(empty)){cleanupFailed=true;errorLine('QA cleanup withheld: workspace changed concurrently')}
  }catch{cleanupFailed=true;errorLine('QA cleanup could not be verified; inspect dedicated QA workspace')}
 }
 if(channel&&a){try{assert.equal(await a.removeChannel(channel),'ok')}catch{failed=true;errorLine('QA channel cleanup failed')}}
 for(const c of clients){try{const current=check(await c.auth.getSession());if(current.session)check(await c.auth.signOut({scope:'local'}))}catch{failed=true;errorLine('QA session cleanup failed')}finally{c.realtime.disconnect()}}
 if(cleanupFailed)failed=true;
}
if(!failed&&live)logLine(write?'AUTH_REALTIME_WRITE_PASS':'AUTH_READONLY_COMPLETE');
return !failed;
}
