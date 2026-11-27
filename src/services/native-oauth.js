// Keep an attempt bound to the open account panel. No raw callback URLs or codes
// are persisted or logged. A stopped process or closed panel requires a fresh login.
export const NATIVE_OAUTH_REDIRECT='com.weepwood.todo://auth/callback';
export const NATIVE_OAUTH_TTL=5*60*1000;
export function parseNativeOAuthCallback(raw){
 if(typeof raw!=='string'||raw.length>4096)return null;
 let url;try{url=new URL(raw)}catch{return null}
 if(url.protocol!=='com.weepwood.todo:'||url.host!=='auth'||url.pathname!=='/callback'||url.username||url.password||url.hash)return null;
 const q=url.searchParams;
 if([...q.keys()].some(k=>!['code','error','error_code','error_description','sb_flow_id'].includes(k)))return null;
 if([...new Set(q.keys())].some(k=>q.getAll(k).length!==1))return null;
 if(q.has('error')||q.has('error_code')||q.has('error_description'))return q.has('code')?null:{kind:'error',...(q.has('sb_flow_id')?{flowId:q.get('sb_flow_id')}:{})};
 const code=q.get('code');
 if(!code||!/^[-A-Za-z0-9._~]{1,1024}$/.test(code))return null;
 return {kind:'code',code,...(q.has('sb_flow_id')?{flowId:q.get('sb_flow_id')}:{})};
}
export function createNativeOAuthAttempt({now=Date.now,ttl=NATIVE_OAUTH_TTL}={}){
 let current=null;
 return {
  begin(){if(current)return null;current={deadline:now()+ttl,phase:'starting'};return current},
  wait(attempt,flowId){if(current!==attempt||now()>=attempt.deadline||!/^[-A-Za-z0-9_]{8,64}$/.test(flowId||''))return false;attempt.flowId=flowId;attempt.phase='waiting';return true},
  take(raw){if(!current||current.phase!=='waiting'||now()>=current.deadline)return null;
   const callback=parseNativeOAuthCallback(raw);if(!callback||(callback.flowId!==undefined&&callback.flowId!==current.flowId))return null;
   const attempt=current;attempt.phase='exchanging';return {attempt,callback}},
  cancel(attempt=current){if(!attempt||current!==attempt||attempt.phase==='exchanging')return false;current=null;return true},
  finish(attempt){if(current!==attempt)return false;current=null;return true},
  owns(attempt){return current===attempt},
 };
}
