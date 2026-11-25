// Supabase storage adapter. No WebView localStorage fallback for credentials.
export const ANDROID_SESSION_KEY='todo-android-auth-v1';
const keys=new Set([ANDROID_SESSION_KEY,ANDROID_SESSION_KEY+'-code-verifier',ANDROID_SESSION_KEY+'-user']);
const keyCheck=key=>{if(!keys.has(key))throw Error('无效的 Android 会话存储键')};
export function createAndroidSessionStorage(invoke){
 return {
  async getItem(key){keyCheck(key);const result=await invoke('plugin:todo-mobile|session_read',{key});
   if(!result||!(result.value===null||typeof result.value==='string'))throw Error('安全会话读取失败');
   return result.value},
  async setItem(key,value){keyCheck(key);if(typeof value!=='string')throw Error('会话格式无效');await invoke('plugin:todo-mobile|session_write',{key,value})},
  async removeItem(key){keyCheck(key);await invoke('plugin:todo-mobile|session_remove',{key})}
 }
}
export async function resetAndroidSession(invoke){
 const store=createAndroidSessionStorage(invoke);for(const key of keys)await store.removeItem(key);
}
