import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseNativeOAuthCallback,createNativeOAuthAttempt,NATIVE_OAUTH_REDIRECT} from '../src/services/native-oauth.js';
test('only exact native callback with unique PKCE code or generic cancellation is accepted',()=>{
 assert.deepEqual(parseNativeOAuthCallback(NATIVE_OAUTH_REDIRECT+'?code=fixture-123'),{kind:'code',code:'fixture-123'});
 assert.deepEqual(parseNativeOAuthCallback(NATIVE_OAUTH_REDIRECT+'?error=access_denied&error_description=fixture'),{kind:'error'});
 for(const bad of ['https://auth/callback?code=x','com.weepwood.todo://other/callback?code=x','com.weepwood.todo://auth/callback/other?code=x','com.weepwood.todo://user@auth/callback?code=x',NATIVE_OAUTH_REDIRECT+'?code=x&code=y',NATIVE_OAUTH_REDIRECT+'?code=x#error',NATIVE_OAUTH_REDIRECT+'#access_token=x',NATIVE_OAUTH_REDIRECT+'?code=x&error=denied',NATIVE_OAUTH_REDIRECT+'?code=%0a',NATIVE_OAUTH_REDIRECT+'?code=x&access_token=y',NATIVE_OAUTH_REDIRECT+'?code='])assert.equal(parseNativeOAuthCallback(bad),null,bad);
});
test('native callback requires one active unexpired attempt; cancellation and replay are harmless',()=>{
 let t=0;const f=createNativeOAuthAttempt({now:()=>t,ttl:5}),url=NATIVE_OAUTH_REDIRECT+'?code=fixture';
 assert.equal(f.take(url),null);let a=f.begin();assert.equal(f.begin(),null);assert.equal(f.take(url),null);assert.equal(f.wait(a,"fixture-flow"),true);assert.equal(f.take('https://bad.invalid'),null);assert.equal(f.take(url+'&sb_flow_id=unrelated'),null);
 assert.deepEqual(f.take(url),{attempt:a,callback:{kind:'code',code:'fixture'}});assert.equal(f.take(url),null);assert.equal(f.cancel(),false);assert.equal(f.finish(a),true);assert.equal(f.take(url),null);
 a=f.begin();assert.equal(f.wait(a,"fixture-flow"),true);assert.equal(f.cancel(a),true);assert.equal(f.take(url),null);
 a=f.begin();assert.equal(f.wait(a,"fixture-flow"),true);t=5;assert.equal(f.take(url),null);assert.equal(f.cancel(a),true);
});
