import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyLive} from '../scripts/verify-live-core.mjs';
import {initialState,newTask} from '../src/domain.js';
const uid='00000000-0000-4000-8000-000000000099';
const clone=x=>structuredClone(x);
const ok=data=>({data,error:null});
function fixture(options={}){
 let row=options.row===undefined?null:clone(options.row),listener=null,updates=0,inserts=0,logins=0,signouts=0;
 const log=[],errors=[];
 const user={id:uid,email_confirmed_at:'2026-11-25T00:00:00Z'};
 const createClient=(_url,_key,{auth:{storage,storageKey}})=>{
  const session=()=>{const s=storage.getItem(storageKey);return s?JSON.parse(s):null};
  const save=()=>{const s={user,access_token:'fake'};storage.setItem(storageKey,JSON.stringify(s));return s};
  return {
   auth:{
    signInWithPassword:async()=>{logins++;return ok({...save(),session:session()})},
    getSession:async()=>ok({session:session()}),
    refreshSession:async()=>session()?ok({user}):{error:{code:'invalid_session'}},
    getUser:async()=>ok({user}),
    signOut:async()=>{signouts++;storage.removeItem(storageKey);return options.signoutFail?{error:{code:'logout_failed'}}:ok(null)}
   },
   from:()=>{
    let operation='read',body,revision;
    const q={select:()=>q,eq:(k,v)=>{if(k==='revision')revision=v;return q},abortSignal:()=>q,
     insert:v=>{operation='insert';body=v;return q},update:v=>{operation='update';body=v;return q},
     single:async()=>{assert.equal(operation,'insert');inserts++;row=clone(body);return ok(clone(row))},
     maybeSingle:async()=>{
      if(operation==='read')return ok(clone(row));
      assert.equal(operation,'update');if(row?.revision!==revision)return ok(null);
      row={...row,...clone(body)};updates++;const result=ok({revision:row.revision});
      if(updates===1){
       if(options.concurrent){row={...row,revision:row.revision+1,state:{...initialState(),tasks:[newTask('Concurrent user edit')]}}}
       else if(!options.noEvent)listener?.({new:{revision:row.revision}});
       if(options.ambiguousWrite)return {error:{code:'network_timeout'}};
      }
      return result;
     }};
    return q;
   },
   channel:()=>{const c={on:(_event,_filter,fn)=>{listener=fn;return c},subscribe:fn=>{fn(options.channelError?'CHANNEL_ERROR':'SUBSCRIBED');return c}};return c},
   removeChannel:async()=>{listener=null;return 'ok'},realtime:{disconnect(){}}
  };
 };
 const fetch=async url=>url.endsWith('/auth/v1/settings')?new Response(JSON.stringify({external:{email:true},disable_signup:false,mailer_autoconfirm:false}),{status:200}):new Response('',{status:401});
 const run=(overrides={})=>verifyLive({url:'https://example.invalid',key:'fake',createClient,fetch,live:true,write:true,env:{TODO_QA_EMAIL:'qa@example.invalid',TODO_QA_PASSWORD:'fake-password',TODO_QA_ALLOW_WRITE:'YES'},timeout:25,logLine:s=>log.push(s),errorLine:s=>errors.push(s),...overrides});
 return {run,log,errors,state:()=>({row:clone(row),updates,inserts,logins,signouts})};
}
test('公开预检不创建认证会话，缺少凭据或写入授权时拒绝',async()=>{
 const f=fixture();assert(await f.run({live:false,write:false,env:{}}));assert.equal(f.state().logins,0);
 assert.equal(await f.run({env:{}}),false);
 assert.equal(await f.run({env:{TODO_QA_EMAIL:'qa@example.invalid',TODO_QA_PASSWORD:'fake'}}),false);
 assert.equal(f.state().inserts,0);assert.equal(f.state().logins,0);
});
test('只读认证验收不写入工作空间',async()=>{
 const f=fixture({row:{revision:3,state:{...initialState(),tasks:[newTask('Existing')]}}});
 assert(await f.run({write:false}));assert.equal(f.state().updates,0);assert.equal(f.state().inserts,0);assert.equal(f.state().logins,2);
});
test('空白账号写入、事件、CAS 与恢复全部成功',async()=>{
 const f=fixture();assert(await f.run());const s=f.state();assert.equal(s.inserts,1);assert.equal(s.updates,2);assert.equal(s.row.revision,3);assert.deepEqual(s.row.state,initialState());assert.equal(s.signouts,2);
});
test('非空工作空间拒绝写入',async()=>{
 const initial={revision:7,state:{...initialState(),tasks:[newTask('Existing')]}};
 const f=fixture({row:initial});assert.equal(await f.run(),false);assert.deepEqual(f.state().row,initial);assert.equal(f.state().updates,0);
});
test('Realtime 订阅失败不写合成任务',async()=>{
 const f=fixture({channelError:true,row:{revision:1,state:initialState()}});assert.equal(await f.run(),false);assert.equal(f.state().updates,0);
});
test('Realtime 超时后按版本恢复合成任务',async()=>{
 const f=fixture({noEvent:true});assert.equal(await f.run(),false);assert.equal(f.state().updates,2);assert.deepEqual(f.state().row.state,initialState());assert(f.log.some(s=>s.includes('fixture recovered')));
});
test('写入响应不明确时安全检查并恢复',async()=>{
 const f=fixture({ambiguousWrite:true});assert.equal(await f.run(),false);assert.equal(f.state().updates,2);assert.deepEqual(f.state().row.state,initialState());
});
test('并发改动时禁止恢复覆盖其他修改',async()=>{
 const f=fixture({concurrent:true});assert.equal(await f.run(),false);assert.equal(f.state().updates,1);assert.equal(f.state().row.state.tasks[0].title,'Concurrent user edit');assert(f.errors.some(s=>s.includes('cleanup withheld')));
});
test('退出失败不能报告验收成功',async()=>{
 const f=fixture({signoutFail:true});assert.equal(await f.run({write:false}),false);assert(!f.log.includes('AUTH_READONLY_COMPLETE'));
});

test('OAuth public gate checks two official hosts and callback without following redirects',async()=>{
 const f=fixture(),providers=[];
 const fetch=async (raw,opts)=>{
  const u=new URL(raw);
  if(u.pathname==='/auth/v1/settings')return new Response(JSON.stringify({external:{email:true,github:true,google:true,azure:false},disable_signup:false,mailer_autoconfirm:false}),{status:200});
  if(u.pathname==='/auth/v1/authorize'){
   assert.equal(opts.redirect,'manual');assert.equal(u.searchParams.get('code_challenge_method'),'s256');assert.match(u.searchParams.get('code_challenge'),/^[A-Za-z0-9_-]{43}$/);
   const provider=u.searchParams.get('provider');providers.push(provider);
   const target=new URL(provider==='github'?'https://github.com/login/oauth/authorize':'https://accounts.google.com/o/oauth2/v2/auth');target.searchParams.set('redirect_uri','https://example.invalid/auth/v1/callback');
   return new Response(null,{status:302,headers:{location:target.href}});
  }
  return new Response('',{status:401});
 };
 assert(await f.run({live:false,write:false,oauth:true,fetch}));assert.deepEqual(providers,['github','google']);assert.equal(f.state().logins,0);
 const bad=fixture();
 assert.equal(await bad.run({live:false,write:false,oauth:true,fetch:async(raw,opts)=>new URL(raw).pathname==='/auth/v1/authorize'?new Response(null,{status:302,headers:{location:'https://example.invalid/bad'}}):fetch(raw,opts)}),false);
 assert.equal(bad.state().logins,0);
});
