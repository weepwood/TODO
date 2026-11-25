// Strict SemVer and immutable, repository-owned release assets only.
export const RELEASE_BASE='https://github.com/weepwood/TODO/releases/';
export const FEED_BASE='https://weepwood.github.io/TODO/updates/';
export const MAX_APK=200*1024*1024;
const versionRe=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
export function parseVersion(v){
 if(typeof v!=='string'||v.length>80)return null;
 const m=v.match(versionRe);if(!m)return null;
 const main=m.slice(1,4).map(Number),pre=m[4]?.split('.')||[];
 if(main.some(n=>!Number.isSafeInteger(n))||pre.some(x=>/^\d+$/.test(x)&&(!Number.isSafeInteger(Number(x))||x.length>1&&x[0]==='0')))return null;
 return {main,pre};
}
export function compareVersion(a,b){
 const x=parseVersion(a),y=parseVersion(b);if(!x||!y)throw Error('版本格式无效');
 for(let i=0;i<3;i++)if(x.main[i]!==y.main[i])return Math.sign(x.main[i]-y.main[i]);
 if(!x.pre.length||!y.pre.length)return Math.sign(y.pre.length-x.pre.length);
 for(let i=0;i<Math.max(x.pre.length,y.pre.length);i++){
  if(x.pre[i]===undefined)return -1;if(y.pre[i]===undefined)return 1;
  const a=x.pre[i],b=y.pre[i];if(a===b)continue;
  const an=/^\d+$/.test(a),bn=/^\d+$/.test(b);
  if(an&&bn)return Math.sign(Number(a)-Number(b));
  if(an!==bn)return an?-1:1;
  return a<b?-1:1;
 }return 0;
}
export const releaseChannel=v=>parseVersion(v)?.pre.length?'preview':'stable';
export const channels=['stable','preview'];
export const platformKeys=['windows-x86_64','darwin-aarch64','android-aarch64'];
const assetNames={'windows-x86_64':v=>'TODO_'+v+'_x64-setup.exe','darwin-aarch64':v=>'TODO_'+v+'_aarch64.app.tar.gz','android-aarch64':v=>'TODO_'+v+'_arm64.apk'};
export function validateFeed(feed,channel){
 if(!channels.includes(channel)||!feed||feed.schema!==1||feed.channel!==channel)throw Error('更新清单格式无效');
 const r=feed.release;if(r===null)return null;
 if(!r||!parseVersion(r.version)||releaseChannel(r.version)!==channel||r.tag!=='v'+r.version||typeof r.notes!=='string'||r.notes.length>20000||typeof r.publishedAt!=='string'||!Number.isFinite(Date.parse(r.publishedAt)))throw Error('更新版本无效');
 if(!r.platforms||Object.keys(r.platforms).length!==platformKeys.length)throw Error('更新平台不完整');
 for(const key of platformKeys){
  const a=r.platforms[key],url=RELEASE_BASE+'download/'+r.tag+'/'+assetNames[key](r.version);
  if(!a||a.url!==url||!Number.isSafeInteger(a.size)||a.size<=0||a.size>MAX_APK||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error('更新资源无效');
  if(key==='android-aarch64'){
   if(!Number.isInteger(a.versionCode)||a.versionCode<1||a.versionCode>2100000000||a.packageName!=='com.weepwood.todo'||!/^[a-f0-9]{64}$/.test(a.certificate))throw Error('Android 更新身份无效');
  }else if(typeof a.signature!=='string'||a.signature.length<40||a.signature.length>4096)throw Error('桌面更新签名缺失');
 }
 return r;
}
export async function readFeed(channel,{fetcher=fetch,signal}={}){
 if(!channels.includes(channel))throw Error('更新渠道无效');
 const res=await fetcher(FEED_BASE+channel+'.json',{cache:'no-store',signal,credentials:'omit',redirect:'error'});
 if(!res.ok)throw Error('更新服务暂不可用 ('+res.status+')');
 const reader=res.body?.getReader();if(!reader)throw Error('更新清单响应无效');
 const chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128*1024)throw Error('更新清单过大');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
 const bytes=new Uint8Array(size);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length}
 return validateFeed(JSON.parse(new TextDecoder().decode(bytes)),channel);
}
export const newerRelease=(release,current)=>release&&compareVersion(release.version,current)>0?release:null;
