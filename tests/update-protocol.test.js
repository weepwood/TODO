import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseVersion,compareVersion,releaseChannel,validateFeed,newerRelease,readFeed} from '../src/services/updates/protocol.js';
const version='1.2.0-alpha.10',tag='v'+version,base='https://github.com/weepwood/TODO/releases/download/'+tag+'/',hash='a'.repeat(64);
function feed(){return {schema:1,channel:'preview',release:{version,tag,notes:'QA',publishedAt:'2026-11-25T00:00:00Z',platforms:{'windows-x86_64':{url:base+'TODO_'+version+'_x64-setup.exe',sha256:hash,size:1234,signature:'s'.repeat(100)},'darwin-aarch64':{url:base+'TODO_'+version+'_aarch64.app.tar.gz',sha256:hash,size:1234,signature:'s'.repeat(100)},'android-aarch64':{url:base+'TODO_'+version+'_arm64.apk',sha256:hash,size:1234,versionCode:102010,packageName:'com.weepwood.todo',certificate:hash}}}}}
test('SemVer 正确比较数字预发行、拒绝异常版本和降级',()=>{
 assert.equal(compareVersion('1.2.0-alpha.10','1.2.0-alpha.2'),1);
 assert.equal(compareVersion('1.2.0','1.2.0-rc.1'),1);
 assert.equal(compareVersion('1.2.0-alpha','1.2.0-alpha.1'),-1);
 assert.equal(compareVersion('1.2.0-alpha.1','1.2.0-alpha.beta'),-1);
 assert.equal(releaseChannel('1.2.0'),'stable');
 for(const v of ['01.2.0','1.2','1.2.0-alpha.01','1.2.0+build','1.2.0-'])assert.equal(parseVersion(v),null);
 assert.equal(newerRelease(feed().release,'1.2.0'),null);
});
test('完整签名更新清单：拒绝渠道、外部 URL、包名、缺失签名和非法大小',()=>{
 assert.equal(validateFeed(feed(),'preview').version,version);
 assert.equal(validateFeed({schema:1,channel:'stable',release:null},'stable'),null);
 for(const mutate of [f=>f.channel='stable',f=>f.release.platforms['android-aarch64'].url='https://example.com/apk',f=>f.release.platforms['android-aarch64'].packageName='evil',f=>f.release.platforms['android-aarch64'].certificate='bad',f=>f.release.platforms['windows-x86_64'].signature='',f=>f.release.platforms['darwin-aarch64'].size=-1,f=>f.release.platforms['android-aarch64'].versionCode=0]){const f=feed();mutate(f);assert.throws(()=>validateFeed(f,'preview'))}
});
test('更新检查固定 HTTPS 地址、禁止重定向、限制响应体',async()=>{
 const fetcher=async(url,opts)=>{assert.equal(url,'https://weepwood.github.io/TODO/updates/preview.json');assert.equal(opts.redirect,'error');return new Response(JSON.stringify(feed()))};
 assert.equal((await readFeed('preview',{fetcher})).version,version);
 await assert.rejects(readFeed('preview',{fetcher:async()=>new Response('x'.repeat(150000))}),/过大/);
 await assert.rejects(readFeed('preview',{fetcher:async()=>new Response('',{status:404})}),/不可用/);
});
