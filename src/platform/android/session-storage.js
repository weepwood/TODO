// Supabase storage adapter. No WebView localStorage fallback for credentials.
export const ANDROID_SESSION_KEY='todo-android-auth-v1';
const keys=new Set([ANDROID_SESSION_KEY,ANDROID_SESSION_KEY+'-code-verifier',ANDROID_SESSION_KEY+'-user']);
const keyCheck=key=>{if(!keys.has(key))throw Error('无效的 Android 会话存储键')};
export function createAndroidSessionStorage(invoke){
 // Locked auth-js creates per-flow verifier slots plus a short index. Keep
 // those transient values in process memory; native session keys stay fixed.
 const flows=new Map();
 const isFlow=key=>key===ANDROID_SESSION_KEY+'-flows-code-verifier'||new RegExp('^'+ANDROID_SESSION_KEY+'-flow-[a-zA-Z0-9_-]{8,64}-code-verifier$').test(key);
 return {
  async getItem(key){if(isFlow(key))return flows.get(key)??null;keyCheck(key);const result=await invoke('plugin:todo-mobile|session_read',{key});
   if(!result||!(result.value===null||typeof result.value==='string'))throw Error('安全会话读取失败');
   return result.value},
  async setItem(key,value){if(typeof value!=='string')throw Error('会话格式无效');if(isFlow(key)){if(!flows.has(key)&&flows.size>=16)throw Error('待完成的授权过多，请重新打开应用');flows.set(key,value);return}keyCheck(key);await invoke('plugin:todo-mobile|session_write',{key,value})},
  async removeItem(key){if(isFlow(key)){flows.delete(key);return}keyCheck(key);await invoke('plugin:todo-mobile|session_remove',{key})}
 }
}
export async function resetAndroidSession(invoke){
 const store=createAndroidSessionStorage(invoke);for(const key of keys)await store.removeItem(key);
}
