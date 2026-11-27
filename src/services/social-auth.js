// OAuth redirects are handled by the existing Supabase auth client, not a separate account system.
export const SOCIAL_PROVIDERS=['github','google','azure'];
export function webAuthRedirect(location,native=false){
 if(native||!location||!['http:','https:'].includes(location.protocol))return null;
 const url=new URL(location.href);
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.protocol!=='https:'&&!local)return null;
 return url.origin+url.pathname;
}
export async function readSocialProviders({url,key,fetcher=fetch,signal}){
 const endpoint=new URL('auth/v1/settings',url.replace(/\/+$/,'')+'/');
 const res=await fetcher(endpoint,{headers:{apikey:key},signal,cache:'no-store'});
 if(!res.ok)throw Error('暂时无法获取第三方登录配置，请稍后重试。');
 const settings=await res.json();
 if(!settings.external||typeof settings.external!=='object')throw Error('无法确认第三方登录配置。');
 return Object.fromEntries(SOCIAL_PROVIDERS.map(p=>[p,settings.external[p]===true]));
}
export async function socialAuthorize({auth,provider,redirectTo,cloudUrl}){
 if(!SOCIAL_PROVIDERS.includes(provider)||!redirectTo)throw Error('当前环境不支持第三方登录。');
 const {data,error}=await auth.signInWithOAuth({provider,options:{redirectTo,skipBrowserRedirect:true,...(provider==='azure'?{scopes:'email'}:{})}});
 if(error)throw error;
 const url=new URL(data?.url||'');
 const expected=new URL('auth/v1/authorize',cloudUrl.replace(/\/+$/,'')+'/');
 if(url.origin!==expected.origin||url.pathname!==expected.pathname||url.searchParams.get('provider')!==provider||url.searchParams.get('redirect_to')!==redirectTo||url.searchParams.get('code_challenge_method')?.toLowerCase()!=='s256'||!url.searchParams.get('code_challenge'))throw Error('第三方授权地址校验失败。');
 return url.href;
}
