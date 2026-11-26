import {CLOUD_URL,CLOUD_KEY} from '../cloud-config.js';
export const EXTERNAL_API_ENABLED=import.meta.env.VITE_TODO_EXTERNAL_API==='1';
export async function ownerExternalRequest(session,path,{method='GET',body,signal}={}){
 if(!EXTERNAL_API_ENABLED||!session?.access_token)throw Error('外部任务接入尚未启用或未登录');
 const response=await fetch(CLOUD_URL.replace(/\/$/,'')+'/functions/v1/todo-external/v1/owner/'+path,{method,headers:{Authorization:'Bearer '+session.access_token,apikey:CLOUD_KEY,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:signal??AbortSignal.timeout(15000),cache:'no-store'});
 const result=await response.json();if(!response.ok)throw Error(result.error||'外部录入请求失败');return result;
}
