import {readMeta,digest} from '../../services/cloud-core.js';
export async function revisionIntent({uid,storage,data,url,key}){
 if(!uid)throw Error('请先登录账号');
 if(storage.flush&&!await storage.flush())throw Error('本机保存失败，未提交后台检查请求');
 const meta=readMeta(storage),hash=await digest(data);
 return {scope:uid,url,key,revision:meta?.revision??null,dirty:!meta||meta.hash!==hash};
}
