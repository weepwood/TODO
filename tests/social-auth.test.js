import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webAuthRedirect,readSocialProviders,socialAuthorize} from '../src/services/social-auth.js';
const site='https://weepwood.github.io/TODO/',cloudUrl='https://example.invalid';
test('web OAuth redirect strips query and fragment, excludes native and insecure hosts',()=>{
 assert.equal(webAuthRedirect(new URL(site+'?code=old#token')),site);
 assert.equal(webAuthRedirect(new URL('http://127.0.0.1:4178/')),'http://127.0.0.1:4178/');
 assert.equal(webAuthRedirect(new URL('http://example.invalid/')),null);
 assert.equal(webAuthRedirect(new URL(site),true),null);
});
test('only actual enabled providers are available',async()=>{
 const result=await readSocialProviders({url:cloudUrl,key:'public',fetcher:async(url,opts)=>{assert.equal(url.href,cloudUrl+'/auth/v1/settings');assert.equal(opts.headers.apikey,'public');return {ok:true,json:async()=>({external:{github:true,google:false,azure:true}})}}});
 assert.deepEqual(result,{github:true,google:false});
 await assert.rejects(readSocialProviders({url:cloudUrl,key:'public',fetcher:async()=>({ok:false})}));
});
test('OAuth uses PKCE and refuses mismatched server or insecure redirects',async()=>{
 for(const provider of ['github','google']){
  const good=new URL(cloudUrl+'/auth/v1/authorize');good.search=new URLSearchParams({provider,redirect_to:site,code_challenge:'fake-test-challenge',code_challenge_method:'s256'});
  const auth={signInWithOAuth:async opts=>{assert.deepEqual(opts,{provider,options:{redirectTo:site,skipBrowserRedirect:true}});return {data:{url:good.href}}}};
  assert.deepEqual(await socialAuthorize({auth,provider,redirectTo:site,cloudUrl}),{url:good.href,flowId:null});
  for(const change of [u=>u.hostname='bad.invalid',u=>u.searchParams.delete('code_challenge'),u=>u.searchParams.set('redirect_to','https://bad.invalid/'),u=>u.searchParams.set('provider','other')]){
   const bad=new URL(good);change(bad);
   await assert.rejects(socialAuthorize({auth:{signInWithOAuth:async()=>({data:{url:bad.href}})},provider,redirectTo:site,cloudUrl}),/校验失败/);
  }
 }
});

test('removed Microsoft provider cannot start OAuth even when server reports enabled',async()=>{
 let called=false;
 const auth={signInWithOAuth:async()=>{called=true;throw Error('must not call')}};
 await assert.rejects(socialAuthorize({auth,provider:'azure',redirectTo:site,cloudUrl}),/不支持/);
 assert.equal(called,false);
});
